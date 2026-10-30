import legacy from './lib/legacy/trading.cjs';
import {guarded} from './lib/guard-relay.mjs';
export default guarded(legacy.handler,true);
