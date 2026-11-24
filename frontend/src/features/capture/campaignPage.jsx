import { useEffect, useState } from 'react';
import { Alert, Group, Loader, Pagination, Text } from '@mantine/core';
import { campaignPageSize } from './captureApi.js';

export function useCampaignPage(api) {
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState(null);

  useEffect(() => {
    const abort = new AbortController();
    api.listCampaigns(page, abort.signal)
      .then((data) => { if (!abort.signal.aborted) setState({ api, page, revision, data }); })
      .catch((error) => { if (!abort.signal.aborted) setState({ api, page, revision, error: error.message }); });
    return () => abort.abort();
  }, [api, page, revision]);

  return {
    page,
    setPage,
    refresh: () => setRevision((current) => current + 1),
    result: state?.api === api && state.page === page && state.revision === revision ? state : null,
  };
}

export function CampaignPager({ page, setPage, total }) {
  if (total <= campaignPageSize) return null;
  return (
    <Group justify="space-between">
      <Text size="sm" c="dimmed">{total} campañas</Text>
      <Pagination total={Math.ceil(total / campaignPageSize)} value={page} onChange={setPage} aria-label="Páginas de campañas" />
    </Group>
  );
}

export function CaptureRequestState({ result }) {
  if (!result) return <Loader size="sm" aria-label="Cargando" />;
  if (result.error) return <Alert color="red" role="alert">{result.error}</Alert>;
  return null;
}
