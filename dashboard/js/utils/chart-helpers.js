/**
 * Shared Chart Layout Helpers.
 */

/**
 * Accurately measures the container's available width.
 * Prevents overestimation caused by parent padding.
 *
 * @param {HTMLElement} containerEl
 * @returns {number}
 */
export function getSafeContainerWidth(containerEl) {
  if (!containerEl) return 960;

  // 1. Primary: containerEl.clientWidth (content width inside parent's padding)
  const clientW = containerEl.clientWidth;
  if (clientW > 0) {
    return clientW;
  }

  // 2. Bounding client rect fallback
  if (typeof containerEl.getBoundingClientRect === 'function') {
    const rect = containerEl.getBoundingClientRect();
    if (rect && rect.width > 0) {
      return Math.floor(rect.width);
    }
  }

  // 3. Parent element minus padding fallback
  if (containerEl.parentElement) {
    const parent = containerEl.parentElement;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const parentStyle = window.getComputedStyle(parent);
      const padLeft = parseFloat(parentStyle.paddingLeft) || 16;
      const padRight = parseFloat(parentStyle.paddingRight) || 16;
      const innerW = parent.clientWidth - padLeft - padRight;
      if (innerW > 0) return innerW;
    }
    return Math.max(parent.clientWidth - 48, 320);
  }

  return 960;
}
