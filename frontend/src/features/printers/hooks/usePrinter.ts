import { useQuery } from '@tanstack/react-query';

import { getPrinterById } from '../api/printersApi';

export function usePrinter(printerId?: string) {
  return useQuery({
    queryKey: ['printers', printerId],
    queryFn: () => getPrinterById(printerId || ''),
    enabled: Boolean(printerId),
    refetchInterval: 30000,
  });
}
