/** Supplemental evidence for axe INCOMPLETE results, not a WCAG certificate.
 * Every original finding remains in the raw report. Every visible text run is
 * checked, not sampled. Supported opaque sRGB linear gradients get conservative
 * whole-gradient bounds, never a guessed point colour. Unsupported paint,
 * opacity, clipping and occlusion stay unresolved and fail the caller's gate.
 */
import type { Page } from 'playwright-core';
import type { AxeResults } from 'axe-core';
export interface A11yReview {
  name: string;
  rule: string;
  target: string[];
  status: 'verified' | 'failed' | 'unresolved';
  method: string;
  detail?: unknown;
}
export async function reviewIncomplete(page: Page, name: string, findings: AxeResults['incomplete']): Promise<A11yReview[]> {
  if (!findings.length) return [];
  // tsx preserves local helper names using __name, but Playwright sends only the
  // callback. Install that identity helper in this disposable page, then undo it.
  const hadNameHelper: boolean = await page.evaluate('typeof globalThis.__name !== "undefined"');
  await page.evaluate('globalThis.__name ??= ((target) => target)');
  const seen = new Set<string>(), requests: { rule: string; target: string[]; simple: boolean }[] = [];
  for (const finding of findings) for (const node of finding.nodes) {
    const signature = `${finding.id}:${JSON.stringify(node.target)}`;
    if (seen.has(signature)) continue; seen.add(signature);
    const target = node.target.filter((value): value is string => typeof value === 'string');
    requests.push({ rule: finding.id, target, simple: target.length === 1 && target.length === node.target.length });
  }
  const scroll = await page.evaluateHandle(() => ({ x: scrollX, y: scrollY,
    elements: Array.from(document.querySelectorAll<HTMLElement>('*')).filter(element => element.scrollLeft || element.scrollTop).map(element => ({ element, top: element.scrollTop, left: element.scrollLeft })),
  }));
  try {
    // One DOM roundtrip instead of thousands of full axe traversals. Each raw
    // target still has its own text/colour/geometry evidence, including failures.
    return await page.evaluate(({ name, requests }) => {
      const rgba = (value: string): number[] => /^rgba?\(/.test(value) ? value.match(/[\d.]+/g)?.map(Number) || [] : [];
      const luminance = (rgb: number[]): number => rgb.slice(0, 3).map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').normalize('NFC');
      const linearStops = (image: string): number[][] | null => {
        // Restrict the grammar to the opaque rgb() linear gradients we can
        // bound. URLs, other colour spaces, layered/radial images, transparent
        // stops and unsupported syntax are deliberately NOT auto-approved.
        const skeleton = image.replace(/rgba?\([^)]*\)/g, 'C');
        if (!/^linear-gradient\((?:-?[\d.]+deg,\s*)?C(?:\s+[\d.]+%)?(?:,\s*C(?:\s+[\d.]+%)?)+\)$/.test(skeleton)) return null;
        const colours = [...image.matchAll(/rgba?\([^)]*\)/g)].map(match => rgba(match[0]));
        return colours.length >= 2 && colours.every(colour => colour.length >= 3 && (colour[3] ?? 1) === 1) ? colours : null;
      };
      return requests.map(request => {
        const row: A11yReview = { name, rule: request.rule, target: request.target, status: 'unresolved', method: 'requires additional review' };
        if (!request.simple) { row.method = 'shadow/iframe/compound targets require a separate review'; return row; }
        let matches: NodeListOf<HTMLElement>;
        try { matches = document.querySelectorAll<HTMLElement>(request.target[0]); } catch { row.method = 'selector cannot be resolved'; return row; }
        if (matches.length !== 1 || !matches[0].getClientRects().length) { row.method = 'target is not uniquely rendered in this state'; return row; }
        const element = matches[0];
        if (request.rule === 'label-content-name-mismatch') {
          const visible = normalize(element.innerText), explicitName = normalize(element.getAttribute('aria-label') || '');
          if (visible && explicitName) { row.status = explicitName.includes(visible) ? 'verified' : 'failed'; row.method = 'exact visible text contained in explicit accessible name'; row.detail = { visible, name: explicitName }; }
          return row;
        }
        if (request.rule !== 'color-contrast') return row;
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const measurements: unknown[] = [], unresolved: string[] = [];
        const runs: { text: string; textElement: HTMLElement; style: CSSStyleDeclaration; rects: DOMRect[]; native: boolean; pseudoOpacity: number }[] = [];
        const native = element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && ['text', 'search', 'url', 'tel', 'email', 'password', 'number'].includes(element.type);
        if (native) {
          const field = element as HTMLTextAreaElement | HTMLInputElement;
          const text = field.value || field.getAttribute('placeholder') || '';
          if (!text) {
            // An empty editable field has no painted glyphs to grade. Its label,
            // focus indication and other rules remain in the original axe scan.
            row.status = 'verified'; row.method = 'empty native text field: no value or placeholder is painted';
            row.detail = { native: true, valueEmpty: true, placeholderEmpty: true }; return row;
          }
          const style = getComputedStyle(field), paint = field.value ? style : getComputedStyle(field, '::placeholder');
          const box = field.getBoundingClientRect(), left = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth), right = parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
          const top = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth), line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
          runs.push({ text, textElement: field, style: paint, rects: [new DOMRect(box.left + left, box.top + top, Math.max(1, box.width - left - right), Math.min(line, Math.max(1, box.height - top)))], native: true, pseudoOpacity: field.value ? 1 : Number(paint.opacity) });
        } else {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = node.textContent?.trim(), textElement = node.parentElement;
            if (!text || !textElement) continue;
            const style = getComputedStyle(textElement);
            if (style.display === 'none' || style.visibility !== 'visible') continue;
            const range = document.createRange(); range.selectNodeContents(node);
            const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
            if (rects.length) runs.push({ text, textElement, style, rects, native: false, pseudoOpacity: 1 });
          }
        }
        let failed = false;
        for (const run of runs) {
          const { text, textElement, style, rects } = run;
          const foreground = rgba(style.color), layers: { background: number[]; image: string }[] = [], images: string[] = [], unsupported: string[] = [];
          let opacity = run.pseudoOpacity, zoom = 1;
          const clipping: { target: string; boundary: { left: number; top: number; right: number; bottom: number } }[] = [];
          for (let parent: Element | null = textElement; parent; parent = parent.parentElement) {
            const computed = getComputedStyle(parent); opacity *= Number(computed.opacity); zoom *= Number(computed.zoom) || 1;
            if (computed.filter !== 'none' || computed.mixBlendMode !== 'normal') unsupported.push('filter/blend');
            if (computed.clipPath !== 'none') unsupported.push('clip-path');
            const clipsX = ['auto', 'scroll', 'hidden', 'clip'].includes(computed.overflowX), clipsY = ['auto', 'scroll', 'hidden', 'clip'].includes(computed.overflowY);
            if (clipsX || clipsY) {
              const boundary = parent.getBoundingClientRect();
              if (rects.some(rect => clipsX && (rect.left < boundary.left - 1 || rect.right > boundary.right + 1) || clipsY && (rect.top < boundary.top - 1 || rect.bottom > boundary.bottom + 1))) clipping.push({ target: parent.tagName + '.' + String(parent.className), boundary: { left: boundary.left, top: boundary.top, right: boundary.right, bottom: boundary.bottom } });
            }
          }
          for (let parent: Element | null = textElement; parent; parent = parent.parentElement) {
            const computed = getComputedStyle(parent), background = rgba(computed.backgroundColor);
            if (background.length < 3) { unsupported.push('unsupported background colour'); break; }
            layers.unshift({ background, image: computed.backgroundImage });
            if ((background[3] ?? 1) === 1) break;
          }
          let minimum = [255, 255, 255], maximum = [255, 255, 255];
          for (const layer of layers) {
            const alpha = layer.background[3] ?? 1;
            minimum = minimum.map((under, index) => layer.background[index] * alpha + under * (1 - alpha));
            maximum = maximum.map((under, index) => layer.background[index] * alpha + under * (1 - alpha));
            if (layer.image !== 'none') {
              images.push(layer.image); const stops = linearStops(layer.image);
              if (!stops) unsupported.push('unsupported background image');
              else {
                // Every interpolated sRGB channel lies in this interval. Linear
                // compositing preserves the bound through translucent overlays.
                minimum = [0, 1, 2].map(index => Math.min(...stops.map(colour => colour[index])));
                maximum = [0, 1, 2].map(index => Math.max(...stops.map(colour => colour[index])));
              }
            }
          }
          const alpha = foreground[3] ?? 1;
          const foregroundMin = foreground.slice(0, 3).map((channel, index) => channel * alpha + minimum[index] * (1 - alpha));
          const foregroundMax = foreground.slice(0, 3).map((channel, index) => channel * alpha + maximum[index] * (1 - alpha));
          const bgMin = luminance(minimum), bgMax = luminance(maximum), fgMin = luminance(foregroundMin), fgMax = luminance(foregroundMax);
          const ratio = foreground.length < 3 ? null : fgMax < bgMin ? (bgMin + .05) / (fgMax + .05) : bgMax < fgMin ? (fgMin + .05) / (bgMax + .05) : 1;
          const size = parseFloat(style.fontSize) * zoom, threshold = size >= 24 || size >= 18.66 && parseInt(style.fontWeight) >= 700 ? 3 : 4.5;
          const points = rects.flatMap(rect => [rect.left + Math.min(2, rect.width / 3), rect.left + rect.width / 2, rect.right - Math.min(2, rect.width / 3)].map(x => {
            const y = rect.top + rect.height / 2, hit = document.elementFromPoint(x, y);
            return { x, y, exposed: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && !!hit && (hit === textElement || textElement.contains(hit)), blocker: hit && !(hit === textElement || textElement.contains(hit)) ? hit.tagName + (hit.className ? '.' + String(hit.className).replace(/\s+/g, '.') : '') : null };
          }));
          const reliable = foreground.length >= 3 && !unsupported.length && opacity >= .999 && !clipping.length && points.every(point => point.exposed);
          const gradientBoundInsufficient = images.length > 0 && ratio! + .001 < threshold;
          measurements.push({ text, native: run.native, reliable, foreground: style.color, background: minimum, backgroundMaximum: maximum, images, unsupported, opacity, clipped: !!clipping.length, clipping, points, ratio, ratioIsConservativeGradientBound: !!images.length, threshold });
          if (!reliable || gradientBoundInsufficient) unresolved.push(text);
          else if (ratio! + .001 < threshold) failed = true;
        }
        row.method = 'supplemental all-text/native-field contrast, conservative supported-gradient bounds, clipping and exposed-point measurements';
        row.detail = { measured: runs.length, unresolved, measurements };
        if (failed) row.status = 'failed'; else if (runs.length && !unresolved.length) row.status = 'verified';
        // A contrast-only rerun cannot establish that clipped/overlapped text is
        // readable; unsupported geometry/paint is never skipped into a pass.
        return row;
      });
    }, { name, requests });
  } finally {
    await scroll.evaluate(position => { for (const entry of position.elements) { entry.element.scrollTop = entry.top; entry.element.scrollLeft = entry.left; } window.scrollTo({ left: position.x, top: position.y, behavior: 'instant' }); });
    await scroll.dispose();
    if (!hadNameHelper) await page.evaluate('delete globalThis.__name');
  }
}
