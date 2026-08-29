import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  OUTBOUND_ARTIFACT_TOOL,
  OutboundArtifactRegistry,
  createOutboundArtifactTool,
  installOutboundArtifactTool,
  materializeOutboundArtifact,
  readExactArtifactFile,
  releaseOutboundArtifact,
  requestedPaths,
} from '../src/channels/shared/semantic/artifact.mjs';

async function fixture(t) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-im-artifact-workspace-'));
  const outside = await mkdtemp(join(tmpdir(), 'dsh-im-artifact-outside-'));
  t.after(async () => {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });
  let nextId = 0;
  const registry = new OutboundArtifactRegistry({
    uuid: () => `artifact-id-${++nextId}`,
  });
  t.after(() => registry.clear());
  const agent = {
    session: {
      header: { id: 'session-artifact', cwd: workspace },
      events: [
        { type: 'turn/start', data: { turn: 7 } },
        { type: 'user/message', data: { turn: 7, source: { rpcId: 'rpc-artifact' } } },
      ],
    },
  };
  return { workspace, outside, registry, agent };
}

function execution(agent, callId, overrides = {}) {
  return {
    name: OUTBOUND_ARTIFACT_TOOL,
    agent,
    callId,
    rootCallId: callId,
    token: Symbol(callId),
    ...overrides,
  };
}

async function execute(tool, args, exec, result = { isError: false }) {
  const value = await tool.definition.execute(args, exec);
  tool.onResult(exec, result);
  return value;
}

async function takeFile(registry, sessionId = 'session-artifact', turn = 7) {
  const [artifact] = registry.take(sessionId, turn);
  assert.ok(artifact);
  const file = await materializeOutboundArtifact(artifact);
  return { artifact, file };
}

test('requestedPaths keeps a string as one file and accepts a string array', () => {
  assert.deepEqual(requestedPaths({ path: 'one.txt' }), ['one.txt']);
  assert.deepEqual(requestedPaths({ path: ['a.txt', 'b.txt'] }), ['a.txt', 'b.txt']);
  assert.deepEqual(requestedPaths({ path: '   ' }), []);
  assert.deepEqual(requestedPaths({ path: [] }), []);
  assert.throws(
    () => requestedPaths({ path: ['ok.txt', ''] }),
    (error) => error instanceof TypeError,
  );
});

test('an existing file can be sent directly without recreation', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'existing.txt'), 'already here');
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  const result = await execute(tool, { path: 'existing.txt' }, execution(fx.agent, 'existing'));

  assert.deepEqual(result, {
    artifactId: 'artifact-id-1',
    fileName: 'existing.txt',
    size: 12,
  });
  const { artifact, file } = await takeFile(fx.registry);
  assert.equal(file.bytes.toString(), 'already here');
  releaseOutboundArtifact(artifact);
});

test('absolute outside-workspace paths and symbolic links are delivered normally', async (t) => {
  const fx = await fixture(t);
  const outsidePath = join(fx.outside, 'outside.txt');
  await writeFile(outsidePath, 'outside content');
  await symlink(outsidePath, join(fx.workspace, 'linked.txt'));
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  await execute(tool, { path: outsidePath }, execution(fx.agent, 'outside'));
  await execute(tool, { path: 'linked.txt' }, execution(fx.agent, 'linked'));

  const artifacts = fx.registry.take('session-artifact', 7);
  assert.equal(artifacts.length, 2);
  const files = await Promise.all(artifacts.map((artifact) => materializeOutboundArtifact(artifact)));
  assert.deepEqual(files.map((file) => file.fileName), ['outside.txt', 'linked.txt']);
  assert.deepEqual(files.map((file) => file.bytes.toString()), ['outside content', 'outside content']);
  for (const artifact of artifacts) releaseOutboundArtifact(artifact);
});

test('empty, sensitive-looking, and extension-mismatched files are not filtered', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'empty.txt'), '');
  await writeFile(
    join(fx.workspace, '.env'),
    'PASSWORD=example\n-----BEGIN PRIVATE KEY-----\nexample\n',
  );
  await writeFile(join(fx.workspace, 'plain.png'), 'not a PNG signature');
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  await execute(tool, { path: 'empty.txt' }, execution(fx.agent, 'empty'));
  await execute(tool, { path: '.env' }, execution(fx.agent, 'sensitive-looking'));
  await execute(tool, { path: 'plain.png' }, execution(fx.agent, 'extension-mismatch'));

  const artifacts = fx.registry.take('session-artifact', 7);
  assert.equal(artifacts.length, 3);
  const files = await Promise.all(artifacts.map((artifact) => materializeOutboundArtifact(artifact)));
  assert.deepEqual(files.map((file) => file.size), [0, 53, 19]);
  assert.equal(files[1].bytes.toString().startsWith('PASSWORD='), true);
  assert.equal(files[2].bytes.toString(), 'not a PNG signature');
  for (const artifact of artifacts) releaseOutboundArtifact(artifact);
});

test('a path array registers every file and keeps a single path result shape', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'first.txt'), 'one');
  await writeFile(join(fx.workspace, 'second.txt'), 'two');
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  const single = await execute(tool, { path: 'first.txt' }, execution(fx.agent, 'single'));
  const many = await execute(
    tool,
    { path: ['first.txt', 'second.txt'] },
    execution(fx.agent, 'many'),
  );

  assert.deepEqual(single, {
    artifactId: 'artifact-id-1',
    fileName: 'first.txt',
    size: 3,
  });
  assert.equal(many.artifacts.length, 2);
  assert.deepEqual(many.artifacts.map(({ fileName, size }) => ({ fileName, size })), [
    { fileName: 'first.txt', size: 3 },
    { fileName: 'second.txt', size: 3 },
  ]);
  assert.equal(new Set(many.artifacts.map((artifact) => artifact.artifactId)).size, 2);
  const artifacts = fx.registry.take('session-artifact', 7);
  assert.equal(artifacts.length, 3);
  assert.deepEqual(artifacts.map((artifact) => artifact.origin.callId), [
    'single',
    'many',
    'many',
  ]);
  for (const artifact of artifacts) releaseOutboundArtifact(artifact);
});

test('a path array rolls back earlier snapshots when a later path fails', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'ok.txt'), 'ok');
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  await assert.rejects(
    tool.definition.execute(
      { path: ['ok.txt', 'missing.txt'] },
      execution(fx.agent, 'partial-array'),
    ),
    (error) => error.code === 'artifact-unavailable',
  );

  assert.deepEqual(fx.registry.take('session-artifact', 7), []);
});

test('the registry does not deduplicate or impose project-level file-count quotas', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'same.txt'), 'same');
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  for (let index = 0; index < 12; index += 1) {
    await execute(tool, { path: 'same.txt' }, execution(fx.agent, `same-${index}`));
  }

  const artifacts = fx.registry.take('session-artifact', 7);
  assert.equal(artifacts.length, 12);
  assert.equal(new Set(artifacts.map((artifact) => artifact.artifactId)).size, 12);
  for (const artifact of artifacts) releaseOutboundArtifact(artifact);
});

test('registration keeps a private snapshot without changing or deleting the source file', async (t) => {
  const fx = await fixture(t);
  const path = join(fx.workspace, 'mutable.txt');
  await writeFile(path, 'first value');
  const tool = createOutboundArtifactTool({ registry: fx.registry });
  await execute(tool, { path }, execution(fx.agent, 'snapshot'));
  await writeFile(path, 'second value');

  const { artifact, file } = await takeFile(fx.registry);
  assert.equal(file.bytes.toString(), 'first value');
  releaseOutboundArtifact(artifact);
  assert.equal(await readFile(path, 'utf8'), 'second value');
});

test('missing paths and directories fail because they cannot be uploaded as files', async (t) => {
  const fx = await fixture(t);
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  await assert.rejects(
    tool.definition.execute({ path: 'missing.txt' }, execution(fx.agent, 'missing')),
    (error) => error.code === 'artifact-unavailable',
  );
  await assert.rejects(
    tool.definition.execute({ path: '.' }, execution(fx.agent, 'directory')),
    (error) => error.code === 'artifact-not-file',
  );
});

test('a failed authoritative tool result is not delivered', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'failed.txt'), 'failed');
  const tool = createOutboundArtifactTool({ registry: fx.registry });

  await execute(
    tool,
    { path: 'failed.txt' },
    execution(fx.agent, 'failed'),
    { isError: true },
  );

  assert.deepEqual(fx.registry.take('session-artifact', 7), []);
});

test('Code Mode waits for the outer execution result before delivery', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'nested.txt'), 'nested');
  const tool = createOutboundArtifactTool({ registry: fx.registry });
  const rootToken = Symbol('root');
  const nested = execution(fx.agent, 'nested', {
    parent: rootToken,
    rootCallId: 'root-call',
  });

  await execute(tool, { path: 'nested.txt' }, nested);
  assert.deepEqual(fx.registry.take('session-artifact', 7), []);
  tool.onResult({
    name: 'run_code',
    callId: 'root-call',
    rootCallId: 'root-call',
    token: rootToken,
    agent: fx.agent,
  }, { isError: false });

  const { artifact, file } = await takeFile(fx.registry);
  assert.equal(file.bytes.toString(), 'nested');
  releaseOutboundArtifact(artifact);
});

test('Session and Turn ownership routes files only to the originating conversation', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'owned.txt'), 'owned');
  const tool = createOutboundArtifactTool({ registry: fx.registry });
  await execute(tool, { path: 'owned.txt' }, execution(fx.agent, 'owned'));

  assert.deepEqual(fx.registry.take('other-session', 7), []);
  assert.deepEqual(fx.registry.take('session-artifact', 8), []);
  const [artifact] = fx.registry.take('session-artifact', 7);
  assert.ok(artifact);
  releaseOutboundArtifact(artifact);
});

test('a completed Turn without a channel consumer releases its unclaimed snapshot', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'unclaimed.txt'), 'unclaimed');
  const artifact = await fx.registry.stage(
    { path: 'unclaimed.txt' },
    execution(fx.agent, 'unclaimed'),
  );
  fx.registry.commit(artifact);

  fx.registry.observeSessionEvent(
    { id: 'session-artifact' },
    { type: 'turn/end', data: { turn: 7 } },
  );

  assert.deepEqual(fx.registry.take('session-artifact', 7), []);
  await assert.rejects(
    materializeOutboundArtifact(artifact),
    (error) => error.code === 'artifact-invalid',
  );
});

test('a channel consumer keeps its completed Turn available until polling claims it', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'consumer.txt'), 'consumer');
  const closeConsumer = fx.registry.openConsumer('session-artifact', 'rpc-artifact');
  fx.registry.observeSessionEvent(
    { id: 'session-artifact' },
    { type: 'turn/start', data: { turn: 7 } },
  );
  fx.registry.observeSessionEvent(
    { id: 'session-artifact' },
    { type: 'user/message', data: { source: { rpcId: 'rpc-artifact' } } },
  );
  const tool = createOutboundArtifactTool({ registry: fx.registry });
  await execute(tool, { path: 'consumer.txt' }, execution(fx.agent, 'consumer'));

  fx.registry.observeSessionEvent(
    { id: 'session-artifact' },
    { type: 'turn/end', data: { turn: 7 } },
  );
  const [artifact] = fx.registry.take('session-artifact', 7);
  assert.ok(artifact);
  closeConsumer();

  const file = await materializeOutboundArtifact(artifact);
  assert.equal(file.bytes.toString(), 'consumer');
  releaseOutboundArtifact(artifact);
});

test('closing an unclaimed channel consumer releases its completed Turn', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'consumer-closed.txt'), 'consumer closed');
  const closeConsumer = fx.registry.openConsumer('session-artifact', 'rpc-artifact');
  fx.registry.observeSessionEvent(
    { id: 'session-artifact' },
    { type: 'turn/start', data: { turn: 7 } },
  );
  fx.registry.observeSessionEvent(
    { id: 'session-artifact' },
    { type: 'user/message', data: { source: { rpcId: 'rpc-artifact' } } },
  );
  const artifact = await fx.registry.stage(
    { path: 'consumer-closed.txt' },
    execution(fx.agent, 'consumer-closed'),
  );
  fx.registry.commit(artifact);
  fx.registry.observeSessionEvent(
    { id: 'session-artifact' },
    { type: 'turn/end', data: { turn: 7 } },
  );

  closeConsumer();

  assert.deepEqual(fx.registry.take('session-artifact', 7), []);
  await assert.rejects(
    materializeOutboundArtifact(artifact),
    (error) => error.code === 'artifact-invalid',
  );
});

test('aborting the owning delivery releases its unhanded snapshot', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'abort.txt'), 'abort');
  const tool = createOutboundArtifactTool({ registry: fx.registry });
  await execute(tool, { path: 'abort.txt' }, execution(fx.agent, 'abort'));
  const controller = new AbortController();
  const [artifact] = fx.registry.take('session-artifact', 7, { signal: controller.signal });
  controller.abort();

  await assert.rejects(
    materializeOutboundArtifact(artifact),
    (error) => error.code === 'artifact-invalid',
  );
});

test('an explicit release also cleans a snapshot that was already claimed', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'handoff-failed.txt'), 'handoff failed');
  const tool = createOutboundArtifactTool({ registry: fx.registry });
  await execute(tool, { path: 'handoff-failed.txt' }, execution(fx.agent, 'handoff-failed'));
  const [artifact] = fx.registry.take('session-artifact', 7);

  fx.registry.release(artifact);

  await assert.rejects(
    materializeOutboundArtifact(artifact),
    (error) => error.code === 'artifact-invalid',
  );
});

test('cleanup requested during materialization runs as soon as the read completes', async (t) => {
  const fx = await fixture(t);
  await writeFile(join(fx.workspace, 'concurrent-cleanup.txt'), Buffer.alloc(1024 * 1024, 7));
  const tool = createOutboundArtifactTool({ registry: fx.registry });
  await execute(
    tool,
    { path: 'concurrent-cleanup.txt' },
    execution(fx.agent, 'concurrent-cleanup'),
  );
  const [artifact] = fx.registry.take('session-artifact', 7);

  const materializing = materializeOutboundArtifact(artifact);
  fx.registry.clear();
  const file = await materializing;

  assert.equal(file.size, 1024 * 1024);
  await assert.rejects(
    materializeOutboundArtifact(artifact),
    (error) => error.code === 'artifact-invalid',
  );
});

test('exact reads have no independent timeout and preserve caller cancellation', async () => {
  let read = 0;
  const handle = {
    async read(_buffer, _offset, _length, position) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (position === 0 && read++ === 0) return { bytesRead: 1 };
      return { bytesRead: 0 };
    },
  };
  const bytes = await readExactArtifactFile(handle, 1);
  assert.equal(bytes.byteLength, 1);

  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await assert.rejects(
    readExactArtifactFile(handle, 1, { signal: controller.signal }),
    /cancelled/,
  );
});

test('Host installer always exposes the tool and explicitly permits existing files', () => {
  let definition;
  const listeners = new Map();
  let section;
  const installed = installOutboundArtifactTool({
    tools: { register(value) { definition = value; } },
    on(name, value) { listeners.set(name, value); },
    systemPrompt: { section(value) { section = value; } },
  }, { registry: new OutboundArtifactRegistry() });

  assert.equal(installed, true);
  assert.equal(definition.name, OUTBOUND_ARTIFACT_TOOL);
  assert.match(definition.description, /Existing and newly created files are both valid/);
  assert.match(definition.description, /one string or an array of strings/);
  assert.equal(definition.parameters.properties.path.oneOf.length, 2);
  assert.match(section.text, /Existing files can be sent directly/);
  assert.match(section.text, /array of strings/);
  assert.equal(typeof listeners.get('tools/result'), 'function');
  assert.equal(typeof listeners.get('session/event'), 'function');
  assert.equal(typeof listeners.get('session/disposed'), 'function');
  assert.equal(listeners.has('agent/inbox/claimed'), false);
  assert.equal(listeners.has('system-prompt/assemble'), false);
  assert.equal(installOutboundArtifactTool({}), false);
});
