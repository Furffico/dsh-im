import {
  materializeOutboundArtifact,
  releaseOutboundArtifact,
} from './artifact.mjs';
import {
  createArtifactFailureReceipt,
  createDeliveryReceipt,
  mergeDeliveryReceipts,
  providerMessageIdsFor,
} from './delivery.mjs';

function unavailableError() {
  const error = new Error('Native file delivery is unavailable');
  error.code = 'artifact-provider-unavailable';
  return error;
}

function isAbort(error, signal) {
  return signal?.aborted
    || error?.name === 'AbortError'
    || error?.code === 'ABORT_ERR';
}

function providerIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value
      .filter((candidate) => (
        (typeof candidate === 'string' && candidate.trim())
          || Number.isSafeInteger(candidate)
      ))
      .map(String))];
  }
  return providerMessageIdsFor(value);
}

async function sendMaterializedArtifact(file, {
  sendFile,
  sendImage,
  signal,
}) {
  if (file.mediaType?.startsWith('image/') && typeof sendImage === 'function') {
    try {
      return {
        presentation: 'image',
        result: await sendImage(file),
      };
    } catch (error) {
      if (isAbort(error, signal) || error?.code === 'artifact-delivery-uncertain') {
        throw error;
      }
    }
  }
  signal?.throwIfAborted();
  if (typeof sendFile !== 'function') throw unavailableError();
  return {
    presentation: 'file',
    result: await sendFile(file),
  };
}

function sameCallGroup(artifacts, start) {
  const key = artifacts[start]?.origin?.callId;
  if (typeof key !== 'string' || !key) return artifacts.slice(start, start + 1);
  let end = start + 1;
  while (end < artifacts.length && artifacts[end]?.origin?.callId === key) end += 1;
  return artifacts.slice(start, end);
}

function sentReceipt(channelKey, presentation, result, files) {
  return createDeliveryReceipt({
    deliveryId: files[0].deliveryKey,
    presentation: `${channelKey}-${presentation}`,
    providerMessageIds: providerIds(result),
    artifacts: files.map((file) => ({ artifactId: file.artifactId, outcome: 'sent' })),
  });
}

/**
 * Deliver registered artifacts with one shared image-first policy while keeping
 * provider protocol details inside the channel-supplied send closures.
 */
export async function deliverOutboundArtifacts({
  artifacts = [],
  baseReceipt = null,
  deliveryId,
  aggregatePresentation,
  alwaysMerge = false,
  channelKey,
  signal,
  sendFile,
  sendFiles,
  sendImage,
  sendFailureNotice,
  onFailure,
  logger,
}) {
  const receipts = baseReceipt ? [baseReceipt] : [];
  let userVisible = Boolean(baseReceipt) && baseReceipt.deliveryOutcome !== 'failed';
  let failureNoticeVisible = false;
  let artifactsSent = 0;
  let artifactSendErrors = 0;

  const recordFailure = async (artifact, error) => {
    artifactSendErrors += 1;
    const failure = typeof onFailure === 'function'
      ? await onFailure(artifact, error)
      : null;
    const reference = typeof failure?.referenceId === 'string'
      ? ` [${failure.referenceId}]`
      : '';
    logger?.warn?.(
      `[dsh-im:${channelKey}] result artifact delivery failed${reference} (${error?.code ?? 'unknown'})`,
    );
    let messageIds = [];
    if (typeof sendFailureNotice === 'function') {
      try {
        signal?.throwIfAborted();
        const notice = await sendFailureNotice(artifact, error, failure);
        signal?.throwIfAborted();
        messageIds = providerIds(notice);
        failureNoticeVisible = true;
      } catch (noticeError) {
        if (isAbort(noticeError, signal)) throw noticeError;
        logger?.warn?.(
          `[dsh-im:${channelKey}] unable to send the safe artifact failure notice`,
        );
      }
    }
    const failureReceipt = createArtifactFailureReceipt({
      artifactId: artifact?.artifactId ?? 'unknown',
      deliveryId: artifact?.deliveryKey ?? artifact?.artifactId ?? 'unknown',
      error,
      providerMessageIds: messageIds,
    });
    receipts.push(failureReceipt);
    if (failureNoticeVisible || failureReceipt.artifacts[0]?.outcome === 'unknown') {
      userVisible = true;
    }
  };

  const sendOne = async (artifact) => {
    try {
      signal?.throwIfAborted();
      const file = await materializeOutboundArtifact(artifact, { signal });
      signal?.throwIfAborted();
      const sent = await sendMaterializedArtifact(file, {
        sendFile,
        sendImage,
        signal,
      });
      signal?.throwIfAborted();
      receipts.push(sentReceipt(channelKey, sent.presentation, sent.result, [file]));
      artifactsSent += 1;
      userVisible = true;
    } catch (error) {
      if (isAbort(error, signal)) throw error;
      await recordFailure(artifact, error);
    } finally {
      releaseOutboundArtifact(artifact);
    }
  };

  const sendGroup = async (group) => {
    const remaining = new Set(group);
    const prepared = [];
    try {
      for (const artifact of group) {
        try {
          signal?.throwIfAborted();
          const file = await materializeOutboundArtifact(artifact, { signal });
          prepared.push({ artifact, file });
        } catch (error) {
          if (isAbort(error, signal)) throw error;
          await recordFailure(artifact, error);
          releaseOutboundArtifact(artifact);
          remaining.delete(artifact);
        }
      }
      if (prepared.length === 0) return;
      signal?.throwIfAborted();
      try {
        const files = prepared.map(({ file }) => file);
        const result = await sendFiles(files);
        signal?.throwIfAborted();
        receipts.push(sentReceipt(channelKey, 'file', result, files));
        artifactsSent += files.length;
        userVisible = true;
      } catch (error) {
        if (isAbort(error, signal)) throw error;
        if (error?.code === 'artifact-delivery-uncertain' || typeof sendFile !== 'function') {
          for (const { artifact } of prepared) await recordFailure(artifact, error);
          return;
        }
        for (const { artifact, file } of prepared) {
          try {
            signal?.throwIfAborted();
            const sent = await sendMaterializedArtifact(file, {
              sendFile,
              sendImage,
              signal,
            });
            signal?.throwIfAborted();
            receipts.push(sentReceipt(channelKey, sent.presentation, sent.result, [file]));
            artifactsSent += 1;
            userVisible = true;
          } catch (sendError) {
            if (isAbort(sendError, signal)) throw sendError;
            await recordFailure(artifact, sendError);
          }
        }
      }
    } finally {
      for (const { artifact } of prepared) {
        releaseOutboundArtifact(artifact);
        remaining.delete(artifact);
      }
      for (const artifact of remaining) releaseOutboundArtifact(artifact);
    }
  };

  let artifactIndex = 0;
  try {
    while (artifactIndex < artifacts.length) {
      if (typeof sendFiles === 'function') {
        const group = sameCallGroup(artifacts, artifactIndex);
        artifactIndex += group.length;
        if (group.length > 1) await sendGroup(group);
        else await sendOne(group[0]);
        continue;
      }
      const artifact = artifacts[artifactIndex];
      artifactIndex += 1;
      await sendOne(artifact);
    }
  } finally {
    while (artifactIndex < artifacts.length) {
      releaseOutboundArtifact(artifacts[artifactIndex]);
      artifactIndex += 1;
    }
  }

  let receipt = null;
  if (receipts.length === 1 && !alwaysMerge) {
    [receipt] = receipts;
  } else if (receipts.length > 0) {
    receipt = mergeDeliveryReceipts({
      deliveryId: deliveryId
        ?? baseReceipt?.deliveryId
        ?? artifacts[0]?.deliveryKey,
      presentation: aggregatePresentation
        ?? `${channelKey}-${baseReceipt ? 'text-and-files' : 'files'}`,
      receipts,
    });
  }

  return {
    receipt,
    userVisible,
    failureNoticeVisible,
    artifactsSent,
    artifactSendErrors,
  };
}
