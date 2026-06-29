import { useQuery } from '@tanstack/react-query';
import { listInventoryDevices } from '../api/inventoryDevicesApi';

export function useInventoryDevices() {
  const query = useQuery({
    queryKey: ['inventory-devices'],
    queryFn: listInventoryDevices,
  });

  return {
    ...query,
    devices: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    refreshDevices: query.refetch,
    isRefreshingDevices: Boolean(query.isFetching),
  };
}
