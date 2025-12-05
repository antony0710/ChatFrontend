import React from 'react';
import { Box, Button, Container, Flex, Heading, Text } from '@chakra-ui/react';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const TOP_USERS_LIMIT = 100;
const RECENT_MESSAGES_LIMIT = 100;
const REFRESH_INTERVAL_MS = 5000;

type TopUser = {
    uname?: string | null;
    open_id?: string | null;
    messageCount: number;
};

type DanmakuMessage = {
    id?: number | string;
    uname?: string | null;
    open_id?: string | null;
    msg?: string | null;
    timestamp?: number | string | null;
    created_at?: string | null;
    room_id?: number | string | null;
};

type TopUsersResponse = {
    limit?: number;
    sinceHours?: number;
    topUsers?: TopUser[];
};

type RecentMessagesResponse = {
    limit?: number;
    messages?: DanmakuMessage[];
};

type HistoryCountResponse = {
    totalMessages?: number;
};

const getApiBaseUrl = () => {
    try {
        if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) {
            return import.meta.env.VITE_API_BASE_URL;
        }
    } catch (error) {
        console.warn('Unable to read VITE_API_BASE_URL, falling back to default.', error);
    }
    return DEFAULT_BASE_URL;
};

const formatNumber = (value: number) => new Intl.NumberFormat().format(value);

const resolveMessageTimestamp = (message: DanmakuMessage): number | null => {
    if (message.timestamp !== undefined && message.timestamp !== null) {
        const numericTimestamp = Number(message.timestamp);
        if (!Number.isNaN(numericTimestamp)) {
            return numericTimestamp > 1e12 ? numericTimestamp : numericTimestamp * 1000;
        }
    }

    if (message.created_at) {
        const parsed = Date.parse(message.created_at);
        return Number.isNaN(parsed) ? null : parsed;
    }

    return null;
};

const formatMessageTimestamp = (message: DanmakuMessage) => {
    const timestampMs = resolveMessageTimestamp(message);
    if (!timestampMs) return 'Unknown time';
    return new Date(timestampMs).toLocaleString();
};

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        const rawBody = (await response.text()).trim();
        const snippet = rawBody.slice(0, 200);
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}${snippet ? ` - ${snippet}` : ''}`);
    }
    return (await response.json()) as T;
}

export default function DYSChat() {
    const apiBaseUrl = React.useMemo(() => getApiBaseUrl(), []);
    const [topUsers, setTopUsers] = React.useState<TopUser[]>([]);
    const [recentMessages, setRecentMessages] = React.useState<DanmakuMessage[]>([]);
    const [totalMessages, setTotalMessages] = React.useState(0);
    const [sinceHours, setSinceHours] = React.useState<number | null>(null);
    const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isFetching, setIsFetching] = React.useState(false);
    const [searchUname, setSearchUname] = React.useState('');
    const [searchOpenId, setSearchOpenId] = React.useState('');
    const [userMessages, setUserMessages] = React.useState<DanmakuMessage[]>([]);
    const [userSearchStatus, setUserSearchStatus] = React.useState<'idle' | 'loading' | 'success'>('idle');
    const [userSearchError, setUserSearchError] = React.useState<string | null>(null);
    const [lastSearchLabel, setLastSearchLabel] = React.useState('');
    const [isUserModalOpen, setIsUserModalOpen] = React.useState(false);

    const isMountedRef = React.useRef(true);
    const fetchLockRef = React.useRef(false);

    React.useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const fetchDashboardData = React.useCallback(async () => {
        console.log('[DYSChat] Triggering dashboard fetch...', { apiBaseUrl });
        if (fetchLockRef.current) return;
        fetchLockRef.current = true;
        setIsFetching(true);
        setError(null);

        try {
            const [topUsersResponse, recentMessagesResponse, historyCountResponse] = await Promise.all([
                fetchJson<TopUsersResponse>(`${apiBaseUrl}/stats/top-users?limit=${TOP_USERS_LIMIT}`),
                fetchJson<RecentMessagesResponse>(`${apiBaseUrl}/messages/recent?limit=${RECENT_MESSAGES_LIMIT}`),
                fetchJson<HistoryCountResponse>(`${apiBaseUrl}/stats/history-count`),
            ]);

            console.log('[DYSChat] API responses received', {
                topUsersCount: topUsersResponse.topUsers?.length ?? 0,
                recentMessagesCount: recentMessagesResponse.messages?.length ?? 0,
                totalMessages: historyCountResponse.totalMessages ?? 0,
                sinceHours: topUsersResponse.sinceHours,
            });

            if (!isMountedRef.current) return;

            setTopUsers(topUsersResponse.topUsers ?? []);
            setSinceHours(topUsersResponse.sinceHours ?? null);
            setRecentMessages(recentMessagesResponse.messages ?? []);
            setTotalMessages(historyCountResponse.totalMessages ?? 0);
            setLastUpdated(Date.now());
        } catch (err) {
            console.error('[DYSChat] Failed to fetch dashboard data', err);
            if (!isMountedRef.current) return;
            const message = err instanceof Error ? err.message : 'Failed to fetch dashboard data.';
            setError(message);
        } finally {
            if (isMountedRef.current) {
                setIsFetching(false);
            }
            fetchLockRef.current = false;
        }
    }, [apiBaseUrl]);

    React.useEffect(() => {
        fetchDashboardData();
        const intervalId = window.setInterval(fetchDashboardData, REFRESH_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, [fetchDashboardData]);

    const handleUserSearch = React.useCallback(async () => {
        const trimmedOpenId = searchOpenId.trim();
        const trimmedUname = searchUname.trim();

        if (!trimmedOpenId && !trimmedUname) {
            setUserSearchError('Enter a user ID or username to search.');
            return;
        }

        setUserSearchError(null);
        setUserSearchStatus('loading');

        try {
            const params = new URLSearchParams({ limit: '200' });
            if (trimmedOpenId) {
                params.set('openId', trimmedOpenId);
            } else {
                params.set('uname', trimmedUname);
            }

            const response = await fetchJson<RecentMessagesResponse>(`${apiBaseUrl}/messages/by-user?${params.toString()}`);
            setUserMessages(response.messages ?? []);
            setLastSearchLabel(trimmedOpenId ? `user ID ${trimmedOpenId}` : `username "${trimmedUname}"`);
            setUserSearchStatus('success');
            setIsUserModalOpen(true);
        } catch (err) {
            console.error('[DYSChat] Failed to search messages by user', err);
            setUserSearchError(err instanceof Error ? err.message : 'Failed to search messages by user.');
            setUserSearchStatus('idle');
        }
    }, [apiBaseUrl, searchOpenId, searchUname]);

    const isSearchingUser = userSearchStatus === 'loading';

    const panelBg = 'gray.200';
    const panelBorder = 'gray.700';
    const mutedText = 'gray.500';

    const sinceHoursLabel = sinceHours ?? 24;

    return (
        <Container maxW="container.xl" py={6} minH="100vh">
            <Flex direction="column" gap={6}>
                <Flex direction={{ base: 'column', lg: 'row' }} gap={4} align="stretch">
                    <Box flex="1" bg={panelBg} border="1px solid" borderColor={panelBorder} borderRadius="lg" p={6}
                    >
                        <Text fontSize="sm" textTransform="uppercase" color={mutedText} letterSpacing="wide">
                            Captured Messages
                        </Text>
                        <Heading color={'red.500'} size="2xl">{formatNumber(totalMessages)}</Heading>
                        <Text mt={2} color={mutedText} fontSize="sm">
                            {lastUpdated
                                ? `Last updated ${new Date(lastUpdated).toLocaleTimeString()}${isFetching ? ' · refreshing...' : ''}`
                                : 'Waiting for first update...'}
                        </Text>
                    </Box>
                    <Box
                        flex="1"
                        bg={panelBg}
                        border="1px solid"
                        borderColor={panelBorder}
                        borderRadius="lg"
                        p={6}
                    >
                        <Heading size="sm" color={mutedText} textTransform="uppercase">
                            Search By User
                        </Heading>
                        <Text fontSize="sm" color={mutedText} mt={1}>
                            Provide a username or user ID to pull their recent messages.
                        </Text>
                        <Flex direction="column" gap={3} mt={4}>
                            <Box>
                                <Text fontSize="sm" mb={1}>
                                    Username
                                </Text>
                                <input
                                    placeholder="e.g. streamerFan"
                                    value={searchUname}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchUname(event.target.value)}
                                    disabled={isSearchingUser}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '0.375rem',
                                        border: '1px solid #4a5568',
                                    }}
                                />
                            </Box>
                            <Box>
                                <Text fontSize="sm" mb={1}>
                                    User ID
                                </Text>
                                <input
                                    placeholder="open_id"
                                    value={searchOpenId}
                                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchOpenId(event.target.value)}
                                    disabled={isSearchingUser}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '0.375rem',
                                        border: '1px solid #4a5568',
                                    }}
                                />
                            </Box>
                            <Button
                                colorScheme="purple"
                                onClick={handleUserSearch}
                                disabled={isSearchingUser}
                            >
                                {isSearchingUser ? 'Searching…' : 'Search User Messages'}
                            </Button>
                            {userSearchError && (
                                <Text fontSize="sm" color="red.500">
                                    {userSearchError}
                                </Text>
                            )}
                            {userSearchStatus === 'success' && (
                                <Flex direction="column" gap={2}>
                                    <Text fontSize="sm" color={mutedText}>
                                        Latest search captured {userMessages.length} message{userMessages.length === 1 ? '' : 's'} for {lastSearchLabel || 'selected user'}
                                    </Text>
                                    <Button size="sm" variant="outline" colorScheme="purple" onClick={() => setIsUserModalOpen(true)}>
                                        View Results
                                    </Button>
                                </Flex>
                            )}
                        </Flex>
                    </Box>
                    <Button
                        alignSelf={{ base: 'stretch', md: 'auto' }}
                        onClick={fetchDashboardData}
                        disabled={isFetching}
                        colorScheme="blue"
                        minW="150px"
                    >
                        {isFetching ? 'Refreshing…' : 'Refresh Now'}
                    </Button>
                </Flex>

                {error && (
                    <Box
                        role="alert"
                        border="1px solid"
                        borderColor="red.500"
                        bg="red.900"
                        color="red.100"
                        borderRadius="md"
                        p={4}
                    >
                        {error}
                    </Box>
                )}

                {userSearchStatus === 'success' && isUserModalOpen && (
                    <Box
                        position="fixed"
                        inset={0}
                        bg="rgba(0, 0, 0, 0.7)"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        zIndex={1000}
                        p={4}
                    >
                        <Box
                            bg="white"
                            borderRadius="lg"
                            maxW="900px"
                            width="100%"
                            maxHeight="90vh"
                            overflow="hidden"
                            boxShadow="2xl"
                        >
                            <Flex justify="space-between" align="center" p={4} borderBottom="1px solid" borderColor="gray.200">
                                <Heading size="md" color="gray.700">
                                    Messages for {lastSearchLabel}
                                </Heading>
                                <Button size="sm" onClick={() => setIsUserModalOpen(false)}>
                                    Close
                                </Button>
                            </Flex>
                            <Box p={4} overflowY="auto" maxH="calc(90vh - 70px)">
                                {userMessages.length === 0 ? (
                                    <Text color="gray.500">No messages found for this user.</Text>
                                ) : (
                                    <Box display="flex" flexDirection="column" gap={4}>
                                        {userMessages.map((message, index) => (
                                            <Box
                                                key={`user-modal-${message.id ?? message.timestamp ?? index}`}
                                                border="1px solid"
                                                borderColor="gray.200"
                                                borderRadius="md"
                                                p={4}
                                            >
                                                <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={2}>
                                                    <Text fontWeight="bold">
                                                        {message.uname?.trim() || message.open_id || 'Anonymous'}
                                                    </Text>
                                                    <Text fontSize="sm" color="gray.500">
                                                        {formatMessageTimestamp(message)}
                                                    </Text>
                                                </Flex>
                                                <Text mt={2}>{message.msg || '—'}</Text>
                                                {message.room_id && (
                                                    <Text mt={2} fontSize="xs" color="gray.500">
                                                        Room: {message.room_id}
                                                    </Text>
                                                )}
                                            </Box>
                                        ))}
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Box>
                )}
                <Flex direction={{ base: 'column', lg: 'row' }} gap={6} align="stretch">
                    <Box
                        flex={{ base: '1', lg: '0.9' }}
                        bg={panelBg}
                        border="1px solid"
                        borderColor={panelBorder}
                        borderRadius="lg"
                        p={6}
                        maxH="80vh"
                        overflowY="auto"
                                                css={{
      "&::-webkit-scrollbar": {
        width: "4px",
      },
      "&::-webkit-scrollbar-track": {
        width: "6px",
      },
      "&::-webkit-scrollbar-thumb": {
        background: "#020202ff",
        borderRadius: "24px",
      },
    }}
                    >
                        <Flex justify="space-between" align="center" mb={4}>
                            <Heading color={mutedText} size="md">Top {TOP_USERS_LIMIT} Senders</Heading>
                            <Text fontSize="sm" color={mutedText}>
                                Last {sinceHoursLabel}h
                            </Text>
                        </Flex>
                        {topUsers.length === 0 ? (
                            <Text color={mutedText}>No messages captured yet.</Text>
                        ) : (
                            <Box as="ol" pl={0} style={{ listStyle: 'none' }}>
                                {topUsers.map((user, index) => (
                                    <Flex
                                        key={`${user.open_id ?? user.uname ?? index}`}
                                        justify="space-between"
                                        align="center"
                                        py={2}
                                        borderBottom={index === topUsers.length - 1 ? 'none' : '1px solid'}
                                        borderColor={panelBorder}
                                    >
                                        <Text fontWeight="semibold">
                                            <Text as="span" color={mutedText} mr={2}>
                                                #{index + 1}
                                            </Text>
                                            {user.uname?.trim() || user.open_id || 'Unknown user'}
                                        </Text>
                                        <Text fontVariant="tabular-nums">{formatNumber(user.messageCount)}</Text>
                                    </Flex>
                                ))}
                            </Box>
                        )}
                    </Box>

                    <Box
                        flex={{ base: '1', lg: '1.1' }}
                        bg={panelBg}
                        border="1px solid"
                        borderColor={panelBorder}
                        borderRadius="lg"
                        p={6}
                        maxH="80vh"
                        overflowY="auto"
                                                                        css={{
      "&::-webkit-scrollbar": {
        width: "4px",
      },
      "&::-webkit-scrollbar-track": {
        width: "6px",
      },
      "&::-webkit-scrollbar-thumb": {
        background: "#020202ff",
        borderRadius: "24px",
      },
    }}
                    >
                        <Flex justify="space-between" align="center" mb={4}>
                            <Heading color={mutedText} size="md">Most Recent Messages</Heading>
                            <Text fontSize="sm" color={mutedText}>
                                Showing {Math.min(recentMessages.length, RECENT_MESSAGES_LIMIT)} latest
                            </Text>
                        </Flex>
                        {recentMessages.length === 0 ? (
                            <Text color={mutedText}>No recent messages to display.</Text>
                        ) : (
                            <Box display="flex" flexDirection="column" gap={4}>
                                {recentMessages.map((message, index) => (
                                    <Box
                                        key={`${message.id ?? message.timestamp ?? index}`}
                                        border="1px solid"
                                        borderColor={panelBorder}
                                        borderRadius="md"
                                        p={4}
                                    >
                                        <Flex justify="space-between" align={{ base: 'flex-start', md: 'center' }} gap={2}>
                                            <Text fontWeight="bold">
                                                {message.uname?.trim() || message.open_id || 'Anonymous'}
                                            </Text>
                                            <Text fontSize="sm" color={mutedText}>
                                                {formatMessageTimestamp(message)}
                                            </Text>
                                        </Flex>
                                        <Text mt={2}>{message.msg || '—'}</Text>
                                        {message.room_id && (
                                            <Text mt={2} fontSize="xs" color={mutedText}>
                                                Room: {message.room_id}
                                            </Text>
                                        )}
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                </Flex>
            </Flex>
        </Container>
    );
}
