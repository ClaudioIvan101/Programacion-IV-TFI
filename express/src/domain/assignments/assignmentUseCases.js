export function makeAssignmentUseCases({ repository, notify }) {
  async function deliver(assignmentId) {
    // Se reserva un intento en la base antes del efecto externo, sin retener una transacción durante SMTP.
    const message = await repository.claim(assignmentId);
    if (!message) return false;
    let status;
    try {
      status = await notify(message);
    } catch {
      // No consta si el servidor aceptó el mensaje: reenviarlo podría duplicarlo.
      status = 'uncertain';
    }
    await repository.settle(assignmentId, status);
    return true;
  }

  return {
    async list(actor) {
      const canManage = actor.role !== 'vendedor';
      return { canManage, assignments: await repository.list(canManage ? null : actor.id) };
    },
    eligible: () => repository.eligible(),
    async assign(assignedBy, payload) {
      const result = await repository.assign({ ...payload, assignedBy });
      if (result.kind !== 'created') return result;
      await deliver(result.row.id);
      return { kind: 'created', row: await repository.get(result.row.id) };
    },
    async retry(id) {
      if (await deliver(id)) return { kind: 'updated', row: await repository.get(id) };
      return { kind: await repository.get(id) ? 'not_retriable' : 'not_found' };
    },
    recordFirstContact: (id, sellerId) => repository.recordFirstContact(id, sellerId),
  };
}
