export function makeGetCampaignById({ campaignRepository }) {
  return async function getCampaignById(id) {
    // Delega la búsqueda al repositorio inyectado.
    // Devuelve la campaña o null si no existe.
    return campaignRepository.findById(id);
  };
}