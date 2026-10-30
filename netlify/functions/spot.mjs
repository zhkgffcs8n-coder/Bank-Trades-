import legacy from './lib/legacy/spot.cjs';
import {guarded} from './lib/guard-relay.mjs';
export default guarded(legacy.handler,false);
