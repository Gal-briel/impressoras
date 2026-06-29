import { useContext } from 'react';

import { RealtimeContext } from './RealtimeProvider';

export function useRealtime() {
  return useContext(RealtimeContext);
}
