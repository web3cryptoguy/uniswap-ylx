import { PartialMessage } from '@bufbuild/protobuf'
import { ConnectError } from '@connectrpc/connect'
import { useQuery } from '@connectrpc/connect-query'
import { UseQueryResult } from '@tanstack/react-query'
import { ExploreStatsRequest, ExploreStatsResponse } from '@uniswap/client-explore/dist/uniswap/explore/v1/service_pb'
import { exploreStats } from '@uniswap/client-explore/dist/uniswap/explore/v1/service-ExploreStatsService_connectquery'
import { uniswapGetTransportNoProxy } from 'uniswap/src/data/rest/base'

/**
 * Wrapper around Tanstack useQuery for the Uniswap REST BE service ExploreStats
 * This included top tokens and top pools data
 * @param input { chainId: string } - string representation of the chain to query or `ALL_NETWORKS` for aggregated data
 * @param select - function to transform the data before returning it
 * @returns UseQueryResult<ExploreStatsResponse, ConnectError>
 */
export function useExploreStatsQuery<TSelectType>({
  input,
  enabled = true,
  select,
}: {
  input?: PartialMessage<ExploreStatsRequest>
  enabled?: boolean
  select?: ((data: ExploreStatsResponse) => TSelectType) | undefined
}): UseQueryResult<TSelectType, ConnectError> {
  return useQuery(exploreStats, input, {
    transport: uniswapGetTransportNoProxy, // Use direct API without proxy for Explore page
    enabled,
    select,
    // Add retry logic for network errors
    retry: (failureCount, error) => {
      // Retry up to 3 times for network-related errors
      if (failureCount >= 3) {
        return false
      }
      // Retry for network errors, connection errors, and 5xx errors
      if (error instanceof ConnectError) {
        const code = error.code
        // Retry for network errors, unavailable, and internal errors
        if (
          code === 'unavailable' ||
          code === 'internal' ||
          code === 'deadline_exceeded' ||
          code === 'resource_exhausted' ||
          code === 'aborted'
        ) {
          return true
        }
      }
      // Also retry for fetch errors (network issues)
      if (error instanceof Error && error.name === 'NetworkError') {
        return true
      }
      return false
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  })
}
