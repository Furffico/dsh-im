import * as React from 'react';

import { h } from '../../i18n.js';
import {
  DISCORD_GROUP_RESPONSE_MODES,
  normalizeDiscordGroupResponseMode,
} from '../../../../src/channels/discord/group-response-mode.mjs';
import {
  DISCORD_SESSION_PERMISSIONS,
  normalizeDiscordSessionPermission,
} from '../../../../src/channels/discord/session-permission.mjs';

function modeFor(account) {
  return normalizeDiscordGroupResponseMode(account?.groupResponseMode);
}

function permissionFor(account) {
  return normalizeDiscordSessionPermission(account?.defaultSessionPermission) ?? '';
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

const PERMISSION_OPTIONS = [
  {
    value: '',
    title: '跟随 Host 默认',
    description: '新建会话沿用 Host Settings 里的 permission 默认值。',
  },
  {
    value: DISCORD_SESSION_PERMISSIONS.WORKSPACE_WRITE,
    title: 'Workspace Write',
    description: '工作区内可写，更宽权限需要审批。',
  },
  {
    value: DISCORD_SESSION_PERMISSIONS.DANGER_FULL_ACCESS,
    title: 'Full access',
    description: '无文件沙箱限制，也不弹出审批。',
  },
];

function permissionBadge(permission) {
  if (permission === DISCORD_SESSION_PERMISSIONS.DANGER_FULL_ACCESS) return '已生效：Full access';
  if (permission === DISCORD_SESSION_PERMISSIONS.WORKSPACE_WRITE) return '已生效：Workspace Write';
  return '已生效：跟随 Host 默认';
}

export function DiscordAccountSettings({ account, busy = false, onSave }) {
  const currentMode = modeFor(account);
  const currentPermission = permissionFor(account);
  const modeHelpId = React.useId();
  const permissionHelpId = React.useId();
  const [selectedMode, setSelectedMode] = React.useState(currentMode);
  const [selectedPermission, setSelectedPermission] = React.useState(currentPermission);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    setSelectedMode(currentMode);
    setSelectedPermission(currentPermission);
    setError(null);
  }, [currentMode, currentPermission]);

  const dirty = selectedMode !== currentMode || selectedPermission !== currentPermission;

  const save = async (event) => {
    event.preventDefault();
    setError(null);
    if (!Object.values(DISCORD_GROUP_RESPONSE_MODES).includes(selectedMode)) {
      setError('请选择「线程模式」或「频道直接回复」。');
      return;
    }
    if (selectedPermission && !Object.values(DISCORD_SESSION_PERMISSIONS).includes(selectedPermission)) {
      setError('请选择「跟随 Host 默认」、「Workspace Write」或「Full access」。');
      return;
    }
    try {
      if (typeof onSave !== 'function') {
        throw new Error('Discord 账号设置暂不可用。');
      }
      await onSave({
        groupResponseMode: selectedMode,
        defaultSessionPermission: selectedPermission || null,
      });
    } catch (caught) {
      setError(caught?.message ?? 'Discord 账号设置保存失败。');
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
            'aria-describedby': modeHelpId,
          }, h('span', { 'aria-hidden': 'true' }, '?')),
          h('span', {
            id: modeHelpId,
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
          onChange: (event) => {
            setSelectedMode(event.target.value);
            setError(null);
          },
        }),
        h('span', { className: 'ddc-groupOptionBody' },
          h('strong', null, option.title),
          h('small', null, option.description))))),
    h('div', { className: 'ddc-groupHeading' },
      h('strong', null, '新建会话权限'),
      h('span', { className: 'ddc-groupStatus' },
        h('span', {
          className: 'ddc-groupBadge',
          'data-permission': currentPermission || 'host',
        }, permissionBadge(currentPermission)),
        h('span', { className: 'ddc-groupHelp' },
          h('button', {
            type: 'button',
            className: 'ddc-groupHelpButton',
            'aria-label': '查看 Discord 新建会话权限说明',
            'aria-describedby': permissionHelpId,
          }, h('span', { 'aria-hidden': 'true' }, '?')),
          h('span', {
            id: permissionHelpId,
            className: 'ddc-groupTooltip',
            role: 'tooltip',
          },
            h('span', { className: 'ddc-groupTooltipItem' },
              h('strong', null, '跟随 Host 默认'),
              h('span', null, '不覆盖 Host Settings 的 permission 默认值。')),
            h('span', { className: 'ddc-groupTooltipItem' },
              h('strong', null, 'Workspace Write'),
              h('span', null, '对应 /permission workspace-write。')),
            h('span', { className: 'ddc-groupTooltipItem' },
              h('strong', null, 'Full access'),
              h('span', null, '对应 /permission danger-full-access。只影响新建会话；已有会话发送 /new 后再发普通消息才会生效。')))))),
    h('div', { className: 'ddc-groupField', role: 'radiogroup', 'aria-label': 'Discord 新建会话权限' },
      PERMISSION_OPTIONS.map((option) => h('label', {
        key: option.value || 'host',
        className: 'ddc-groupOption',
      },
        h('input', {
          type: 'radio',
          name: 'defaultSessionPermission',
          value: option.value,
          checked: selectedPermission === option.value,
          disabled: busy,
          onChange: (event) => {
            setSelectedPermission(event.target.value);
            setError(null);
          },
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
        disabled: busy || !dirty,
      }, busy ? '正在保存…' : '保存设置')));
}

export { DiscordAccountSettings as DiscordGroupResponseSettings };
