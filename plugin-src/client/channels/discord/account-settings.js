import * as React from 'react';

import { h } from '../../i18n.js';
import {
  DISCORD_GROUP_RESPONSE_MODES,
  normalizeDiscordGroupResponseMode,
} from '../../../../src/channels/discord/group-response-mode.mjs';

function modeFor(account) {
  return normalizeDiscordGroupResponseMode(account?.groupResponseMode);
}

const MODE_OPTIONS = [
  {
    value: DISCORD_GROUP_RESPONSE_MODES.THREAD,
    title: '线程模式（默认）',
    description: '在被 @ 时为本次对话自动创建 Thread,后续回复都在 Thread 内,避免频道被多人对话刷屏。',
  },
  {
    value: DISCORD_GROUP_RESPONSE_MODES.CHANNEL,
    title: '频道直接回复',
    description: '保持 v0.16.0 及更早版本的旧行为:在被 @ 时直接在源频道里 reply 主消息,线程不会被创建。',
  },
];

export function DiscordGroupResponseSettings({ account, busy = false, onSave }) {
  const currentMode = modeFor(account);
  const helpId = React.useId();
  const [selectedMode, setSelectedMode] = React.useState(currentMode);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    setSelectedMode(currentMode);
    setError(null);
  }, [currentMode]);

  const save = async (event) => {
    event.preventDefault();
    setError(null);
    if (!Object.values(DISCORD_GROUP_RESPONSE_MODES).includes(selectedMode)) {
      setError('请选择「线程模式」或「频道直接回复」。');
      return;
    }
    try {
      if (typeof onSave !== 'function') {
        throw new Error('Discord 群响应模式设置暂不可用。');
      }
      await onSave({ groupResponseMode: selectedMode });
    } catch (caught) {
      setError(caught?.message ?? 'Discord 群响应模式保存失败。');
    }
  };

  return h('form', { className: 'ddc-group', onSubmit: save },
    h('div', { className: 'ddc-groupHeading' },
      h('strong', null, '群响应模式'),
      h('span', { className: 'ddc-groupStatus' },
        h('span', { className: 'ddc-groupBadge', 'data-mode': currentMode },
          currentMode === DISCORD_GROUP_RESPONSE_MODES.CHANNEL ? '已生效：频道直接回复' : '已生效：线程模式'),
        h('span', { className: 'ddc-groupHelp' },
          h('button', {
            type: 'button',
            className: 'ddc-groupHelpButton',
            'aria-label': '查看 Discord 群响应模式说明',
            'aria-describedby': helpId,
          }, h('span', { 'aria-hidden': 'true' }, '?')),
          h('span', {
            id: helpId,
            className: 'ddc-groupTooltip',
            role: 'tooltip',
          },
            h('span', { className: 'ddc-groupTooltipItem' },
              h('strong', null, '线程模式（默认）'),
              h('span', null, '在被 @ 时为本次对话自动创建 Thread,后续回复都在 Thread 内,避免频道被多人对话刷屏。')),
            h('span', { className: 'ddc-groupTooltipItem' },
              h('strong', null, '频道直接回复'),
              h('span', null, '保持 v0.16.0 及更早版本的旧行为:在被 @ 时直接在源频道里 reply 主消息,线程不会被创建。')))))),
    h('div', { className: 'ddc-groupField', role: 'radiogroup', 'aria-label': 'Discord 群响应模式' },
      MODE_OPTIONS.map((option) => h('label', {
        key: option.value,
        className: 'ddc-groupOption',
      },
        h('input', {
          type: 'radio',
          name: 'groupResponseMode',
          value: option.value,
          checked: selectedMode === option.value,
          disabled: busy,
          onChange: () => { setSelectedMode(option.value); setError(null); },
        }),
        h('span', { className: 'ddc-groupOptionBody' },
          h('strong', null, option.title),
          h('small', null, option.description))))),
    error ? h('p', { className: 'ddc-groupError', role: 'alert' }, error) : null,
    h('div', { className: 'ddc-groupActions' },
      h('button', {
        type: 'submit',
        className: 'ddt-button',
        'data-kind': 'secondary',
        disabled: busy || selectedMode === currentMode,
      }, busy ? '正在保存…' : '保存群响应模式')));
}