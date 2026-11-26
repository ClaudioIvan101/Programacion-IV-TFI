import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Group, Loader, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { leadRoute } from '../workspace/workspaceRoute.js';
import { qualificationApi } from './qualificationApi.js';
import {
  DEFAULT_RULE_DRAFT, editorStateToPayload, getRuleDistribution, mergeRuleSets, ruleSetToEditorState,
} from './ruleSelection.js';
import './qualification.css';

const STATUS_LABELS = { active: 'Activa', draft: 'Borrador', archived: 'Archivada' };
const shortDate = (value) => (value ? String(value).slice(0, 10) : 'Sin publicar');

export function ScoringRulesScreen({ accessToken, onUnauthorized, initialLeadId, publishedRules, onRulePublished }) {
  const api = useMemo(() => qualificationApi(accessToken, onUnauthorized), [accessToken, onUnauthorized]);
  const returnHref = initialLeadId ? leadRoute('calificacion', initialLeadId) : '#/calificacion';

  const [fetchedRuleSets, setFetchedRuleSets] = useState(null);
  const [listError, setListError] = useState('');
  const [selectedKey, setSelectedKey] = useState('auto');
  const [draft, setDraft] = useState(() => structuredClone(DEFAULT_RULE_DRAFT));
  const [dirty, setDirty] = useState(false);

  const [newZone, setNewZone] = useState('');
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCondition, setCustomCondition] = useState('');
  const [customPts, setCustomPts] = useState(10);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.ruleSets(controller.signal).then((rows) => {
      if (controller.signal.aborted) return;
      setFetchedRuleSets(rows);
      if (rows.length > 0) {
        const active = rows.find((item) => item.status === 'active') ?? rows[0];
        setSelectedKey(String(active.version));
        setDraft(ruleSetToEditorState(active));
      } else {
        setSelectedKey('new');
        setDraft(structuredClone(DEFAULT_RULE_DRAFT));
        setDirty(true);
      }
    }).catch((failure) => {
      if (controller.signal.aborted) return;
      setFetchedRuleSets([]);
      setListError(failure.message);
      setSelectedKey('new');
      setDraft(structuredClone(DEFAULT_RULE_DRAFT));
      setDirty(true);
    });
    return () => controller.abort();
  }, [api]);

  const allRules = useMemo(
    () => mergeRuleSets(fetchedRuleSets ?? [], publishedRules ?? []),
    [fetchedRuleSets, publishedRules],
  );

  const selectedRule = selectedKey !== 'new' && selectedKey !== 'auto'
    ? allRules.find((item) => String(item.version) === selectedKey) ?? null
    : null;

  const updateDraft = (updater) => {
    setDirty(true);
    setNotice('');
    setDraft((current) => (typeof updater === 'function' ? updater(current) : { ...current, ...updater }));
  };

  function handleSelectVersion(value) {
    if (!value) return;
    setError('');
    setNotice('');
    setSelectedKey(value);
    if (value === 'new') {
      setDraft(structuredClone(DEFAULT_RULE_DRAFT));
      setDirty(true);
      return;
    }
    const found = allRules.find((item) => String(item.version) === value);
    if (found) {
      setDraft(ruleSetToEditorState(found));
      setDirty(false);
    }
  }

  function handleCloneNewVersion() {
    setError('');
    setSelectedKey('new');
    setDraft((current) => ({
      ...structuredClone(current),
      name: `${current.name.replace(/ \(Copia\)$/, '')} (Copia)`,
      status: 'draft',
    }));
    setDirty(true);
    setNotice('Borrador listo para editar. Al guardar se publicará una versión nueva sin alterar evaluaciones anteriores.');
  }

  async function handleSaveAndActivate() {
    if (saving) return;
    setError('');
    setNotice('');
    setSaving(true);
    try {
      let saved;
      if (selectedRule && !dirty) {
        if (selectedRule.status === 'active') {
          setNotice(`La versión v${selectedRule.version} ya está activa.`);
          return;
        }
        saved = await api.activateRuleSet(selectedRule.version);
      } else {
        const payload = editorStateToPayload(draft, 'active');
        saved = await api.publish(payload);
      }
      onRulePublished(saved);
      setFetchedRuleSets((current) => {
        const rest = (current ?? [])
          .filter((item) => item.version !== saved.version)
          .map((item) => (item.status === 'active' ? { ...item, status: 'archived' } : item));
        return [saved, ...rest].sort((a, b) => b.version - a.version);
      });
      setSelectedKey(String(saved.version));
      setDraft(ruleSetToEditorState(saved));
      setDirty(false);
      setNotice(`Versión v${saved.version} ("${saved.name}") guardada y activada.`);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  function addZone() {
    const val = newZone.trim();
    if (!val) return;
    if (draft.zones.list.some((zone) => zone.toLowerCase() === val.toLowerCase())) {
      setNewZone('');
      return;
    }
    updateDraft((current) => ({
      ...current,
      zones: { ...current.zones, list: [...current.zones.list, val] },
    }));
    setNewZone('');
  }

  function handleAddCustomRule(event) {
    event.preventDefault();
    const name = customName.trim();
    if (!name) return;
    const pts = Number(customPts);
    const rule = {
      id: `cr-${Date.now()}`,
      name,
      condition: customCondition.trim(),
      pts: Number.isInteger(pts) ? pts : 10,
      enabled: true,
    };
    updateDraft((current) => ({
      ...current,
      customRules: [...current.customRules, rule],
    }));
    setCustomName('');
    setCustomCondition('');
    setCustomPts(10);
    setCustomModalOpen(false);
  }

  const { segs, totalMax } = getRuleDistribution(draft);
  const denom = Math.max(totalMax, 1);
  const qThr = Number(draft.thresholds.qualified) || 0;
  const dThr = Number(draft.thresholds.discarded);
  const hasDiscard = draft.thresholds.discarded !== '' && draft.thresholds.discarded != null && Number.isFinite(dThr);
  const reviewRangeText = hasDiscard && dThr < qThr ? `${dThr} a ${qThr - 1} pts` : 'Sin rango intermedio';

  const selectData = [
    ...allRules.map((item) => ({
      value: String(item.version),
      label: `v${item.version} · ${item.name || 'Regla comercial'} (${STATUS_LABELS[item.status] ?? 'Archivada'})`,
    })),
    ...(selectedKey === 'new' ? [{ value: 'new', label: `Nueva · ${draft.name || 'Borrador'} (Borrador)` }] : []),
  ];

  const versionStatus = selectedKey === 'new' || dirty ? 'draft' : (selectedRule?.status ?? 'draft');
  const maxUrgency = Math.max(0, ...draft.urgency.tiers.map((t) => Number(t.points) || 0));
  const maxFinancing = Math.max(0, ...draft.financing.tiers.map((t) => Number(t.points) || 0));

  return (
    <Stack gap="md" className="rules-page">
      <header className="rules-header-row">
        <div>
          <Text className="auth-label" fw={700} size="xs">CONFIGURACIÓN COMERCIAL</Text>
          <Title order={1}>Reglas de puntaje</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Definí cómo se calcula el puntaje de calificación de cada interesado según versión de reglas.
          </Text>
        </div>
        <Button component="a" href={returnHref} variant="default" size="sm">
          Ir a calificar interesado
        </Button>
      </header>

      {error && <Alert color="red" role="alert">{error}</Alert>}
      {listError && <Alert color="yellow" role="status">{listError}</Alert>}
      {notice && <Alert color="green" role="status">{notice}</Alert>}

      {/* Encabezado y Versionado */}
      <Paper className="rules-card" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
            <Group gap="md" align="flex-end" wrap="wrap" style={{ flex: '1 1 420px' }}>
              {fetchedRuleSets === null ? (
                <Loader size="xs" aria-label="Cargando versiones" />
              ) : (
                <Select
                  label="Versión de reglas"
                  allowDeselect={false}
                  value={selectedKey}
                  onChange={handleSelectVersion}
                  data={selectData}
                  style={{ minWidth: 260, flex: '1 1 260px' }}
                />
              )}
              <TextInput
                label="Nombre de versión"
                value={draft.name}
                maxLength={120}
                onChange={(event) => updateDraft({ name: event.currentTarget.value })}
                style={{ minWidth: 200, flex: '1 1 200px' }}
              />
              <Group gap="xs" pb={6}>
                <span className="rules-status" data-status={versionStatus}>
                  {STATUS_LABELS[versionStatus] ?? 'Borrador'}
                </span>
                <Text size="xs" c="dimmed" className="qual-mono">
                  {selectedRule ? `Act. ${shortDate(selectedRule.createdAt)}` : 'Sin publicar'}
                </Text>
              </Group>
            </Group>

            <Group gap="xs">
              <Button type="button" variant="default" size="sm" onClick={handleCloneNewVersion} disabled={saving}>
                + Nueva versión
              </Button>
              <Button type="button" size="sm" loading={saving} onClick={handleSaveAndActivate}>
                Guardar y activar versión
              </Button>
            </Group>
          </Group>
        </Stack>
      </Paper>

      {/* Distribución visual de puntos + Umbrales */}
      <Paper className="rules-card" withBorder>
        <Stack gap="md">
          <div>
            <Group gap="xs" align="center" wrap="wrap">
              <Title order={2} size="h4">Distribución total de puntos</Title>
              <span className="qual-tag qual-mono">{totalMax} pts</span>
              {totalMax !== 100 && (
                <span className="rules-warn-text">
                  {totalMax > 100
                    ? `Supera el estándar de 100 pts (+${totalMax - 100} pts)`
                    : `Faltan ${100 - totalMax} pts para completar 100 pts`}
                </span>
              )}
            </Group>
            <Text size="xs" c="dimmed" mt={2}>
              Peso relativo de cada criterio activo sobre el puntaje máximo de la regla.
            </Text>
          </div>

          <div>
            <div className="rules-dist-bar" aria-hidden="true">
              {segs.map((seg) => (
                <div
                  key={seg.label}
                  className="rules-dist-seg"
                  style={{ width: `${Math.max(0, (seg.max / denom) * 100)}%`, background: seg.color }}
                  title={`${seg.label}: ${seg.max} pts`}
                />
              ))}
            </div>
            <div className="rules-dist-legend">
              {segs.length > 0 ? segs.map((seg) => (
                <span key={seg.label}>
                  <span className="rules-dist-swatch" style={{ background: seg.color }} />
                  {seg.label} <strong className="qual-mono" style={{ color: '#f4f4f5' }}>{seg.max}</strong>
                </span>
              )) : (
                <Text size="xs" c="dimmed">Activá al menos un criterio para distribuir puntos.</Text>
              )}
            </div>
          </div>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" pt="sm" style={{ borderTop: '1px solid rgba(255,255,255,0.065)' }}>
            <div className="rules-threshold-box">
              <div>
                <div className="qual-status" data-decision="qualified">Calificado</div>
                <Text size="xs" c="dimmed">Apto para derivar</Text>
              </div>
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed" className="qual-mono">≥</Text>
                <NumberInput
                  aria-label="Umbral calificado"
                  min={1}
                  max={1_000_000}
                  allowDecimal={false}
                  value={draft.thresholds.qualified}
                  onChange={(value) => updateDraft((c) => ({ ...c, thresholds: { ...c.thresholds, qualified: value } }))}
                  styles={{ input: { width: 76, textAlign: 'right', fontFamily: 'var(--mantine-font-family-monospace)' } }}
                  size="xs"
                />
              </Group>
            </div>

            <div className="rules-threshold-box">
              <div>
                <div className="qual-status" data-decision="review">En revisión</div>
                <Text size="xs" c="dimmed">Requiere seguimiento</Text>
              </div>
              <Text size="xs" className="qual-mono" style={{ color: '#d6d3d1' }}>{reviewRangeText}</Text>
            </div>

            <div className="rules-threshold-box">
              <div>
                <div className="qual-status" data-decision="not_qualified">Descartado / Frío</div>
                <Text size="xs" c="dimmed">No califica para venta</Text>
              </div>
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed" className="qual-mono">&lt;</Text>
                <NumberInput
                  aria-label="Umbral descartado"
                  min={0}
                  max={999_999}
                  allowDecimal={false}
                  value={draft.thresholds.discarded}
                  onChange={(value) => updateDraft((c) => ({ ...c, thresholds: { ...c.thresholds, discarded: value } }))}
                  styles={{ input: { width: 76, textAlign: 'right', fontFamily: 'var(--mantine-font-family-monospace)' } }}
                  size="xs"
                />
              </Group>
            </div>
          </SimpleGrid>
        </Stack>
      </Paper>

      {/* 1. Presupuesto mínimo */}
      <Paper className={`rules-card ${draft.budget.enabled ? '' : 'is-disabled'}`} withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Group gap="xs">
                <Title order={3} size="h5">1. Presupuesto mínimo</Title>
                <span className="qual-tag qual-mono">{draft.budget.enabled ? draft.budget.fullPts : 0} pts máx.</span>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                Evalúa si el presupuesto declarado alcanza el mínimo objetivo en la moneda configurada.
              </Text>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Activar presupuesto mínimo"
              aria-checked={draft.budget.enabled}
              className="rules-toggle-switch"
              onClick={() => updateDraft((c) => ({ ...c, budget: { ...c.budget, enabled: !c.budget.enabled } }))}
            />
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <Select
              label="Moneda"
              data={['USD', 'ARS']}
              allowDeselect={false}
              value={draft.budget.currency}
              onChange={(value) => updateDraft((c) => ({ ...c, budget: { ...c.budget, currency: value } }))}
            />
            <NumberInput
              label={`Presupuesto mínimo (${draft.budget.currency})`}
              min={0}
              step={5000}
              value={draft.budget.minAmount}
              onChange={(value) => updateDraft((c) => ({ ...c, budget: { ...c.budget, minAmount: value } }))}
            />
            <NumberInput
              label="Puntos si cumple o supera"
              min={-1_000_000}
              max={1_000_000}
              allowDecimal={false}
              value={draft.budget.fullPts}
              onChange={(value) => updateDraft((c) => ({ ...c, budget: { ...c.budget, fullPts: value } }))}
            />
          </SimpleGrid>

          <div className="rules-tier-row">
            <Group gap="sm">
              <button
                type="button"
                role="switch"
                aria-label="Activar puntaje parcial"
                aria-checked={draft.budget.partialEnabled}
                className="rules-toggle-switch"
                onClick={() => updateDraft((c) => ({ ...c, budget: { ...c.budget, partialEnabled: !c.budget.partialEnabled } }))}
              />
              <div>
                <Text size="xs" fw={500}>Puntaje parcial (80% a 99% del mínimo)</Text>
                <Text size="xs" c="dimmed">Otorga puntos parciales si está cerca del ticket mínimo</Text>
              </div>
            </Group>
            <Group gap={6} wrap="nowrap">
              <NumberInput
                aria-label="Puntos parciales de presupuesto"
                min={-1_000_000}
                max={1_000_000}
                allowDecimal={false}
                disabled={!draft.budget.partialEnabled}
                value={draft.budget.partialPts}
                onChange={(value) => updateDraft((c) => ({ ...c, budget: { ...c.budget, partialPts: value } }))}
                styles={{ input: { width: 72, textAlign: 'right', fontFamily: 'var(--mantine-font-family-monospace)' } }}
                size="xs"
              />
              <Text size="xs" c="dimmed" className="qual-mono">pts</Text>
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* 2. Urgencia / Plazo */}
      <Paper className={`rules-card ${draft.urgency.enabled ? '' : 'is-disabled'}`} withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Group gap="xs">
                <Title order={3} size="h5">2. Urgencia / Plazo de operación</Title>
                <span className="qual-tag qual-mono">{draft.urgency.enabled ? maxUrgency : 0} pts máx.</span>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                Asigna mayor puntaje a interesados con decisión de compra o alquiler cercana.
              </Text>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Activar urgencia"
              aria-checked={draft.urgency.enabled}
              className="rules-toggle-switch"
              onClick={() => updateDraft((c) => ({ ...c, urgency: { ...c.urgency, enabled: !c.urgency.enabled } }))}
            />
          </Group>

          <Stack gap="xs">
            {draft.urgency.tiers.map((tier, idx) => (
              <div key={tier.key} className="rules-tier-row">
                <Text size="xs">{tier.label}</Text>
                <Group gap={6} wrap="nowrap">
                  <NumberInput
                    aria-label={`Puntos para ${tier.label}`}
                    min={-1_000_000}
                    max={1_000_000}
                    allowDecimal={false}
                    value={tier.points}
                    onChange={(value) => updateDraft((c) => ({
                      ...c,
                      urgency: {
                        ...c.urgency,
                        tiers: c.urgency.tiers.map((t, i) => (i === idx ? { ...t, points: value } : t)),
                      },
                    }))}
                    styles={{ input: { width: 72, textAlign: 'right', fontFamily: 'var(--mantine-font-family-monospace)' } }}
                    size="xs"
                  />
                  <Text size="xs" c="dimmed" className="qual-mono">pts</Text>
                </Group>
              </div>
            ))}
          </Stack>
        </Stack>
      </Paper>

      {/* 3. Zonas prioritarias */}
      <Paper className={`rules-card ${draft.zones.enabled ? '' : 'is-disabled'}`} withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Group gap="xs">
                <Title order={3} size="h5">3. Zonas prioritarias</Title>
                <span className="qual-tag qual-mono">{draft.zones.enabled ? draft.zones.pts : 0} pts máx.</span>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                Suma puntos si la zona buscada por el interesado coincide con cobertura prioritaria.
              </Text>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Activar zonas prioritarias"
              aria-checked={draft.zones.enabled}
              className="rules-toggle-switch"
              onClick={() => updateDraft((c) => ({ ...c, zones: { ...c.zones, enabled: !c.zones.enabled } }))}
            />
          </Group>

          <Group gap="xs" wrap="wrap">
            {draft.zones.list.length > 0 ? draft.zones.list.map((zone) => (
              <span key={zone} className="rules-zone-chip">
                <span>{zone}</span>
                <button
                  type="button"
                  className="rules-zone-del"
                  title={`Quitar ${zone}`}
                  aria-label={`Quitar zona ${zone}`}
                  onClick={() => updateDraft((c) => ({
                    ...c,
                    zones: { ...c.zones, list: c.zones.list.filter((item) => item !== zone) },
                  }))}
                >
                  ✕
                </button>
              </span>
            )) : <Text size="xs" c="dimmed">Sin zonas cargadas</Text>}
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <TextInput
                label="Agregar zona prioritaria"
                placeholder="Ej. Caballito, Vicente López…"
                value={newZone}
                onChange={(event) => setNewZone(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addZone();
                  }
                }}
                style={{ flex: 1 }}
              />
              <Button type="button" variant="default" size="sm" onClick={addZone}>
                Agregar
              </Button>
            </Group>
            <NumberInput
              label="Puntos si coincide"
              min={-1_000_000}
              max={1_000_000}
              allowDecimal={false}
              value={draft.zones.pts}
              onChange={(value) => updateDraft((c) => ({ ...c, zones: { ...c.zones, pts: value } }))}
            />
          </SimpleGrid>
        </Stack>
      </Paper>

      {/* 4. Financiación y tipo de operación */}
      <Paper className={`rules-card ${draft.financing.enabled ? '' : 'is-disabled'}`} withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Group gap="xs">
                <Title order={3} size="h5">4. Financiación y tipo de operación</Title>
                <span className="qual-tag qual-mono">{draft.financing.enabled ? maxFinancing : 0} pts máx.</span>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                Pondera la capacidad financiera declarada y modalidad de operación.
              </Text>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Activar financiación"
              aria-checked={draft.financing.enabled}
              className="rules-toggle-switch"
              onClick={() => updateDraft((c) => ({ ...c, financing: { ...c.financing, enabled: !c.financing.enabled } }))}
            />
          </Group>

          <Stack gap="xs">
            {draft.financing.tiers.map((tier, idx) => (
              <div key={tier.key} className="rules-tier-row">
                <Text size="xs">{tier.label}</Text>
                <Group gap={6} wrap="nowrap">
                  <NumberInput
                    aria-label={`Puntos para ${tier.label}`}
                    min={-1_000_000}
                    max={1_000_000}
                    allowDecimal={false}
                    value={tier.points}
                    onChange={(value) => updateDraft((c) => ({
                      ...c,
                      financing: {
                        ...c.financing,
                        tiers: c.financing.tiers.map((t, i) => (i === idx ? { ...t, points: value } : t)),
                      },
                    }))}
                    styles={{ input: { width: 72, textAlign: 'right', fontFamily: 'var(--mantine-font-family-monospace)' } }}
                    size="xs"
                  />
                  <Text size="xs" c="dimmed" className="qual-mono">pts</Text>
                </Group>
              </div>
            ))}
          </Stack>
        </Stack>
      </Paper>

      {/* 5. Completitud de datos */}
      <Paper className={`rules-card ${draft.completeness.enabled ? '' : 'is-disabled'}`} withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Group gap="xs">
                <Title order={3} size="h5">5. Completitud de datos</Title>
                <span className="qual-tag qual-mono">{draft.completeness.enabled ? draft.completeness.fullPts : 0} pts máx.</span>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                Premia consultas con contacto verificado y necesidad / tipología definida.
              </Text>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Activar completitud de datos"
              aria-checked={draft.completeness.enabled}
              className="rules-toggle-switch"
              onClick={() => updateDraft((c) => ({ ...c, completeness: { ...c.completeness, enabled: !c.completeness.enabled } }))}
            />
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <NumberInput
              label="Datos completos (contacto + necesidad)"
              min={-1_000_000}
              max={1_000_000}
              allowDecimal={false}
              value={draft.completeness.fullPts}
              onChange={(value) => updateDraft((c) => ({ ...c, completeness: { ...c.completeness, fullPts: value } }))}
            />
            <NumberInput
              label="Completitud parcial (solo uno)"
              min={-1_000_000}
              max={1_000_000}
              allowDecimal={false}
              value={draft.completeness.partialPts}
              onChange={(value) => updateDraft((c) => ({ ...c, completeness: { ...c.completeness, partialPts: value } }))}
            />
          </SimpleGrid>
        </Stack>
      </Paper>

      {/* 6. Criterios personalizados */}
      {draft.customRules.map((cr) => (
        <Paper key={cr.id} className={`rules-card ${cr.enabled ? '' : 'is-disabled'}`} withBorder>
          <Group justify="space-between" align="center" wrap="nowrap">
            <div>
              <Group gap="xs">
                <Title order={3} size="h5">{cr.name}</Title>
                <span className="qual-tag qual-mono">{cr.enabled ? cr.pts : 0} pts máx.</span>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>{cr.condition || 'Criterio verificable en calificación'}</Text>
            </div>
            <Group gap="xs" wrap="nowrap">
              <Button
                type="button"
                variant="subtle"
                color="red"
                size="compact-xs"
                onClick={() => updateDraft((c) => ({
                  ...c,
                  customRules: c.customRules.filter((item) => item.id !== cr.id),
                }))}
              >
                Eliminar
              </Button>
              <button
                type="button"
                role="switch"
                aria-label={`Activar ${cr.name}`}
                aria-checked={cr.enabled}
                className="rules-toggle-switch"
                onClick={() => updateDraft((c) => ({
                  ...c,
                  customRules: c.customRules.map((item) => (item.id === cr.id ? { ...item, enabled: !item.enabled } : item)),
                }))}
              />
            </Group>
          </Group>
        </Paper>
      ))}

      <Button
        type="button"
        variant="default"
        fullWidth
        className="rules-add-custom-btn"
        onClick={() => setCustomModalOpen(true)}
      >
        + Agregar criterio personalizado
      </Button>

      <Modal
        opened={customModalOpen}
        onClose={() => setCustomModalOpen(false)}
        title="Agregar criterio personalizado"
        centered
        size="md"
      >
        <form onSubmit={handleAddCustomRule}>
          <Stack gap="sm">
            <TextInput
              label="Nombre del criterio"
              required
              maxLength={120}
              placeholder="Ej. Sin venta encadenada"
              value={customName}
              onChange={(event) => setCustomName(event.currentTarget.value)}
            />
            <TextInput
              label="Condición descriptiva"
              maxLength={300}
              placeholder="Ej. No necesita vender otra propiedad para escriturar"
              value={customCondition}
              onChange={(event) => setCustomCondition(event.currentTarget.value)}
            />
            <NumberInput
              label="Puntos máximos"
              required
              min={-1_000_000}
              max={1_000_000}
              allowDecimal={false}
              value={customPts}
              onChange={setCustomPts}
            />
            <Group justify="flex-end" gap="xs" mt="xs">
              <Button type="button" variant="default" onClick={() => setCustomModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Agregar criterio</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
