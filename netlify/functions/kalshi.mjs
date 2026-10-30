import legacy from './lib/legacy/kalshi.cjs';
import {guarded} from './lib/guard-relay.mjs';
export default guarded(legacy.handler,false);
