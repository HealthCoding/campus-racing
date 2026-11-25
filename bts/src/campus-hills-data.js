// Relative landform estimate, NOT surveyed elevations or a DEM.
// The humanities buildings sit along one hillside; coordinates use the existing
// campus map's world axes (.5 world units per metre), not a new building layout.
export const CAMPUS_HILLS = Object.freeze([
 Object.freeze({id:'humanities-ridge',from:Object.freeze({x:-89,z:-109}),to:Object.freeze({x:-53,z:-167}),
  crestRadius:13,outerRadius:66,rise:5.5,
  evidence:'Official campus photos show the shared hillside, entry slopes and retaining levels; relief and transition widths are estimated, not measured.',
  references:Object.freeze(['reference/expansion29/526-0.jpg','reference/expansion29/507-0.jpg','reference/humanities28/527-1.jpg','reference/humanities28/524-2.jpg']),
  buildings:Object.freeze(['oesol','education','widang'])}),
]);
import { estimatedHillRise as hillRise } from './engine/terrain.js';
export function estimatedHillRise(x,z,hills=CAMPUS_HILLS){ return hillRise(x,z,hills); }
