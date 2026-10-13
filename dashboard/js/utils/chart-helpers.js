/**
 * Shared Chart Layout and Tooltip Helpers.
 *
 * Solves:
 * 1. Rightmost column cut-off: Accurately measures inner content width of chart container
 *    without being inflated by parentElement padding (which previously caused ~48px overflow).
 * 2. Off-screen tooltips: Clamps tooltips for left and right columns strictly within screen/viewport.
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

/**
 * ECharts tooltip positioning function that keeps tooltips strictly within screen/container bounds.
 * Prevents tooltips on leftmost and rightmost columns from being clipped or drawn off-screen.
 *
 * @param {Array<number>} point - [cursorX, cursorY]
 * @param {Object} params - Data item params
 * @param {HTMLElement} dom - Tooltip DOM element
 * @param {Object} rect - Target item bounding box {x, y, width, height}
 * @param {Object} size - { contentSize: [boxWidth, boxHeight], viewSize: [viewWidth, viewHeight] }
 * @returns {Array<number>} [posX, posY]
 */
export function getClampedTooltipPosition(point, params, dom, rect, size) {
  if (!size || !size.contentSize || !size.viewSize) {
    return [point[0], Math.max(10, point[1] - 10)];
  }

  const [boxWidth, boxHeight] = size.contentSize;
  const [viewWidth, viewHeight] = size.viewSize;

  // Center horizontally over the target element or cursor
  const targetX = rect && rect.width ? rect.x + rect.width / 2 : point[0];
  const targetY = rect && rect.height ? rect.y : point[1];

  let posX = targetX - boxWidth / 2;
  const padding = 12;

  // Clamp horizontally so tooltip never overflows left or right edges
  if (posX < padding) {
    posX = padding;
  } else if (posX + boxWidth > viewWidth - padding) {
    posX = Math.max(padding, viewWidth - boxWidth - padding);
  }

  // Vertically place above the item with 8px clearance; if too close to top, place below
  let posY = targetY - boxHeight - 8;
  if (posY < 8) {
    const itemBottom = rect && rect.height ? rect.y + rect.height : point[1];
    posY = itemBottom + 8;
    // Also guard bottom edge
    if (posY + boxHeight > viewHeight - 8) {
      posY = Math.max(8, viewHeight - boxHeight - 8);
    }
  }

  return [Math.round(posX), Math.round(posY)];
}
