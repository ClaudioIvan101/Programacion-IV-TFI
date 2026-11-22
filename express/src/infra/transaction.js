// Una transacción por operación: se toma un cliente del pool, se confirma o se
// revierte el trabajo, y siempre se devuelve el cliente al pool.
//
// Vive en su propio módulo para que cualquier repositorio que necesite
// atomicidad use exactamente el mismo comportamiento.
export async function inTransaction(pool, execute) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const output = await execute(client);
    await client.query('COMMIT');
    return output;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
