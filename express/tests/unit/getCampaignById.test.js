import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGetCampaignById,
} from "../../src/domain/campaigns/getCampaignById.js";

const id = "11111111-1111-4111-8111-111111111111";

test("Devuelve la campaña consultada por ID", async () => {
  const campaign = { id, name: "Departamentos" };

  const getCampaignById = makeGetCampaignById({
    // Repositorio falso: probamos el caso de uso sin PostgreSQL.
    campaignRepository: {
      async findById(receivedId) {
        assert.equal(receivedId, id);
        return campaign;
      },
    },
  });

  assert.deepEqual(await getCampaignById(id), campaign);
});

test("Devuelve null cuando la campaña no existe", async () => {
  const getCampaignById = makeGetCampaignById({
    campaignRepository: {
      async findById() {
        return null;
      },
    },
  });

  assert.equal(await getCampaignById(id), null);
});