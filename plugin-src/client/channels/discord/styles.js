export const DISCORD_STYLE_ID = 'xmanrui-dsh-im-discord-settings';

const CSS = String.raw`
.ddc-page { --ddt-accent: #5865f2; --ddt-accent-deep: #4752c4; --ddt-accent-wash: #eef0ff; }
.ddc-avatar { color: #fff; background: #5865f2; }
.ddc-avatar svg { display: block; }
.ddc-group { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 10px; background: var(--dsw-alias-bg-layer-2, #f7f8fa); }
.ddc-groupHeading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ddc-groupHeading > strong { font-size: 13px; }
.ddc-groupStatus { min-width: 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; }
.ddc-groupBadge { flex: none; padding: 3px 8px; border-radius: 999px; color: #4752c4; background: #eef0ff; font-size: 11px; font-weight: 700; }
.ddc-groupBadge[data-mode="channel"] { color: #a15c00; background: #fff3d6; }
.ddc-groupBadge[data-permission="danger-full-access"] { color: #a15c00; background: #fff3d6; }
.ddc-groupBadge[data-permission="workspace-write"] { color: #4752c4; background: #eef0ff; }
.ddc-groupHelp { position: relative; display: inline-flex; flex: none; }
.ddc-groupHelpButton { width: 20px; height: 20px; display: grid; place-items: center; padding: 0; border: 1px solid color-mix(in srgb, #5865f2 28%, var(--dsw-alias-border-l2, #dfe1e5)); border-radius: 50%; color: #4752c4; background: var(--dsw-alias-bg-layer-1, #fff); font: inherit; font-size: 12px; line-height: 1; font-weight: 750; cursor: help; transition: border-color .15s ease, color .15s ease, background .15s ease, box-shadow .15s ease; }
.ddc-groupHelpButton:hover { border-color: #5865f2; color: #3a44a8; background: #eef0ff; }
.ddc-groupHelpButton:focus-visible { outline: none; border-color: #5865f2; box-shadow: 0 0 0 3px color-mix(in srgb, #5865f2 18%, transparent); }
.ddc-groupTooltip { position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; width: 280px; max-width: min(300px, calc(100vw - 48px)); display: grid; gap: 8px; padding: 10px 11px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 9px; color: var(--dsw-alias-label-primary, #1f2329); background: var(--dsw-alias-bg-layer-3, #fff); box-shadow: 0 10px 28px rgb(31 35 41 / 16%); opacity: 0; visibility: hidden; transform: translateY(-3px); pointer-events: none; transition: opacity .15s ease, transform .15s ease, visibility .15s ease; }
.ddc-groupTooltipItem { display: grid; gap: 2px; }
.ddc-groupTooltipItem + .ddc-groupTooltipItem { padding-top: 8px; border-top: 1px solid var(--dsw-alias-border-l2, #eef0f3); }
.ddc-groupTooltipItem strong { color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; line-height: 17px; font-weight: 700; }
.ddc-groupTooltipItem > span { color: var(--dsw-alias-label-secondary, #646a73); font-size: 11px; line-height: 16px; font-weight: 400; }
.ddc-groupHelp:hover .ddc-groupTooltip, .ddc-groupHelp:focus-within .ddc-groupTooltip { opacity: 1; visibility: visible; transform: translateY(0); }
.ddc-groupField { display: grid; gap: 6px; }
.ddc-groupOption { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2, #dfe1e5); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.ddc-groupOption:hover { border-color: #5865f2; }
.ddc-groupOption:has(input:checked) { border-color: #5865f2; background: #eef0ff; }
.ddc-groupOption input { margin: 3px 0 0; accent-color: #5865f2; }
.ddc-groupOption:has(input:disabled) { opacity: .6; cursor: not-allowed; }
.ddc-groupOptionBody { display: grid; gap: 2px; color: var(--dsw-alias-label-primary, #1f2329); font-size: 12px; }
.ddc-groupOptionBody strong { font-weight: 700; }
.ddc-groupOptionBody small { color: var(--dsw-alias-label-secondary, #646a73); font-weight: 400; line-height: 1.5; }
.ddc-groupError { margin: 0; color: var(--dsw-alias-state-error-primary, #d83931); font-size: 12px; line-height: 1.5; }
.ddc-groupActions { display: flex; justify-content: flex-end; }
`;

export function installDiscordStyles() {
  if (typeof document === 'undefined') return () => {};
  const existing = document.querySelector(`style[data-plugin-css="${DISCORD_STYLE_ID}"]`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.dataset.plugin = '@xmanrui/dsh-im';
  style.dataset.pluginCss = DISCORD_STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
}