import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createBulkCommands,
  isFinalBulkStatus,
  listBulkAgents,
  refreshBulkCommandResults,
  type BulkAgent,
  type BulkCommandPayload,
  type BulkCommandResult,
} from '../api/bulkCommandsApi';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useBulkCommands() {
  const [bulkResults, setBulkResults] = useState<BulkCommandResult[]>([]);
  const [isPollingBulkResults, setIsPollingBulkResults] = useState(false);
  const pollingTokenRef = useRef(0);

  const agentsQuery = useQuery({
    queryKey: ['bulk-agents'],
    queryFn: listBulkAgents,
  });

  async function pollCommandResults(initialResults: BulkCommandResult[]) {
    const token = ++pollingTokenRef.current;

    let currentResults = initialResults;

    setIsPollingBulkResults(true);

    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const hasPendingCommand = currentResults.some((result) => {
          if (!result.command_id) return false;
          if (!result.ok) return false;

          return !isFinalBulkStatus(result.status);
        });

        if (!hasPendingCommand) break;

        await sleep(3000);

        if (pollingTokenRef.current !== token) return;

        currentResults = await refreshBulkCommandResults(currentResults);

        if (pollingTokenRef.current !== token) return;

        setBulkResults(currentResults);
      }
    } finally {
      if (pollingTokenRef.current === token) {
        setIsPollingBulkResults(false);
      }
    }
  }

  const mutation = useMutation({
    mutationFn: ({
      agents,
      command,
    }: {
      agents: BulkAgent[];
      command: BulkCommandPayload;
    }) => createBulkCommands(agents, command),

    onSuccess: (results) => {
      setBulkResults(results);
      void pollCommandResults(results);
    },
  });

  function resetBulkResults() {
    pollingTokenRef.current += 1;
    setIsPollingBulkResults(false);
    setBulkResults([]);
    mutation.reset();
  }

  return {
    agents: agentsQuery.data ?? [],
    isLoadingAgents: agentsQuery.isLoading,
    agentsError: agentsQuery.error,
    refetchAgents: agentsQuery.refetch,

    sendBulkCommand: mutation.mutateAsync,
    isSendingBulkCommand: Boolean((mutation as any).isPending || (mutation as any).isLoading),
    isPollingBulkResults,
    bulkResults,
    bulkError: mutation.error,
    resetBulkResults,
  };
}
