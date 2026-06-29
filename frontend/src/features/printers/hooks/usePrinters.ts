import { useQuery } from '@tanstack/react-query';

import { getPrinters } from '../api/printersApi';

export function usePrinters() {
  return useQuery({
    queryKey: ['printers'],
    queryFn: getPrinters,
    refetchInterval: 30000,
  });
}
