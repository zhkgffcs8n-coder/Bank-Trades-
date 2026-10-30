import legacy from './lib/legacy/data.cjs';
import {guarded} from './lib/guard-relay.mjs';
export default guarded(legacy.handler,false);
