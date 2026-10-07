import type { HundredPrints } from './hundred-prints';

declare const hp: HundredPrints;

void hp.render({ templateId: 'tpl', output: { format: 'png', side: 'front' } });
void hp.render({ templateId: 'tpl', output: { format: 'pdf', includeBack: true } });

// @ts-expect-error Images require an explicit side.
void hp.render({ templateId: 'tpl', output: { format: 'png' } });
// @ts-expect-error Images do not accept includeBack.
void hp.render({ templateId: 'tpl', output: { format: 'png', side: 'front', includeBack: true } });
// @ts-expect-error PDFs do not accept side.
void hp.render({ templateId: 'tpl', output: { format: 'pdf', side: 'back' } });
// @ts-expect-error Convenience image methods require side.
void hp.png({ templateId: 'tpl' });
