import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer from 'react-test-renderer';

import {
  DiscordAccountCard,
  DiscordAccountSettings,
  DiscordGroupResponseSettings,
  DiscordSettingsTab,
} from '../../../plugin-src/client/channels/discord/index.js';
import {
  DISCORD_GROUP_RESPONSE_MODES,
} from '../../../src/channels/discord/group-response-mode.mjs';
import {
  DISCORD_SESSION_PERMISSIONS,
} from '../../../src/channels/discord/session-permission.mjs';

const { act } = TestRenderer;

test('Discord settings exposes a Bot Token action without a fake QR action', () => {
  const markup = renderToStaticMarkup(React.createElement(DiscordSettingsTab, {
    rpcCall: async () => ({ ok: true, value: { bots: [] } }),
  }));
  assert.match(markup, /aria-label="使用 Bot Token 接入 Discord 机器人"/);
  assert.match(markup, />手动接入</);
  assert.doesNotMatch(markup, /扫码接入机器人|dim-scanButton/);
});

test('Discord account card matches the unified compact card layout', () => {
  const markup = renderToStaticMarkup(React.createElement(DiscordAccountCard, {
    account: {
      botId: 'discord_test',
      connected: true,
      state: 'connected',
      bot: { name: 'Harness Bot', username: 'HarnessBot', idMasked: '123•••' },
      health: { summary: 'Discord Gateway 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  assert.match(markup, /data-im-channel-logo="discord"/);
  assert.match(markup, /@HarnessBot/);
  assert.match(markup, /class="dim-botHealthGroup"[^]*class="dim-lastChecked"><span>最近检查<\/span>/);
  assert.doesNotMatch(markup, /Gateway 长连接|消息通道|dim-botMetric/);
  assert.match(markup, />检查连接</);
  assert.match(markup, />移除接入</);
  assert.doesNotMatch(markup, /dim-cardSummary/);
});

test('Discord account card defaults to the thread-mode badge', () => {
  const markup = renderToStaticMarkup(React.createElement(DiscordAccountCard, {
    account: {
      botId: 'discord_test',
      connected: true,
      state: 'connected',
      groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.THREAD,
      bot: { name: 'Harness Bot', username: 'harness_bot', idMasked: '123•••' },
      health: { summary: 'Discord Gateway 长连接运行正常', lastCheckedAt: Date.now() },
      error: null,
    },
    onReconnect() {},
    onRequestRemove() {},
    onConfirmRemove() {},
    onCancelRemove() {},
  }));
  assert.match(markup, /已生效：线程模式/);
  assert.match(markup, /aria-label="Discord 群响应模式"/);
  assert.match(markup, /已生效：跟随 Host 默认/);
  assert.match(markup, /aria-label="Discord 新建会话权限"/);
});

test('Discord group response settings reflects the saved mode and persists edits', async () => {
  const saved = [];
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(DiscordGroupResponseSettings, {
      account: {
        botId: 'discord_test',
        groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.THREAD,
      },
      onSave: async (payload) => saved.push(payload),
    }));
  });
  const radios = renderer.root.findAllByType('input').filter((node) => node.props.type === 'radio');
  assert.equal(radios.length, 5);
  assert.equal(radios[0].props.checked, true);
  assert.equal(radios[1].props.checked, false);

  await act(async () => {
    radios[1].props.onChange({ target: { value: DISCORD_GROUP_RESPONSE_MODES.CHANNEL } });
  });
  const modeBadge = renderer.root.findAllByProps({ className: 'ddc-groupBadge' })
    .find((node) => node.props['data-mode']);
  assert.match(modeBadge.children.join(''), /已生效：线程模式/);

  const channelView = renderToStaticMarkup(React.createElement(DiscordGroupResponseSettings, {
    account: {
      botId: 'discord_test',
      groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.CHANNEL,
    },
    onSave: async () => {},
  }));
  assert.match(channelView, /已生效：频道直接回复/);
  await act(async () => renderer.unmount());

  const submitView = TestRenderer.create(React.createElement(DiscordGroupResponseSettings, {
    account: {
      botId: 'discord_test',
      groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.CHANNEL,
    },
    onSave: async (payload) => saved.push(payload),
  }));
  await act(async () => {
    await submitView.root.findByType('form').props.onSubmit({ preventDefault() {} });
  });
  assert.deepEqual(saved, [{
    groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.CHANNEL,
    defaultSessionPermission: null,
  }]);
  submitView.unmount();
});

test('Discord account settings shows the saved default session permission', () => {
  const inheritView = renderToStaticMarkup(React.createElement(DiscordAccountSettings, {
    account: {
      botId: 'discord_test',
      groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.THREAD,
      defaultSessionPermission: null,
    },
    onSave: async () => {},
  }));
  assert.match(inheritView, /已生效：跟随 Host 默认/);
  assert.match(inheritView, /name="defaultSessionPermission"[^]*value="danger-full-access"/);

  const fullAccessView = renderToStaticMarkup(React.createElement(DiscordAccountSettings, {
    account: {
      botId: 'discord_test',
      groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.THREAD,
      defaultSessionPermission: DISCORD_SESSION_PERMISSIONS.DANGER_FULL_ACCESS,
    },
    onSave: async () => {},
  }));
  assert.match(fullAccessView, /已生效：Full access/);
  assert.match(fullAccessView, /data-permission="danger-full-access"/);
});

test('Discord group response settings help tooltip lists both modes', () => {
  const markup = renderToStaticMarkup(React.createElement(DiscordGroupResponseSettings, {
    account: {
      botId: 'discord_test',
      groupResponseMode: DISCORD_GROUP_RESPONSE_MODES.THREAD,
    },
    onSave: async () => {},
  }));
  assert.match(markup, />线程模式（默认）<\/strong>/);
  assert.match(markup, />频道直接回复<\/strong>/);
  assert.match(markup, />新建会话权限<\/strong>/);
  assert.match(markup, />Full access<\/strong>/);
  assert.match(markup, /保持 v0\.16\.0 及更早版本的旧行为/);
  assert.match(markup, /为本次对话自动创建 Thread/);
});

test('Discord group response help opens for pointer hover and keyboard focus', async () => {
  const styles = await readFile(
    new URL('../../../plugin-src/client/channels/discord/styles.js', import.meta.url),
    'utf8',
  );
  assert.match(styles, /\.ddc-groupHelpButton:focus-visible \{/);
  assert.match(
    styles,
    /\.ddc-groupHelp:hover \.ddc-groupTooltip, \.ddc-groupHelp:focus-within \.ddc-groupTooltip \{[^}]*opacity: 1;[^}]*visibility: visible;/,
  );
});
