import { createApp } from "./app.js";
import { createPostgresPool } from "./infra/postgres.js";
import {createPostgresCampaignRepository} from "./infra/campaignRepository.js";
import {makeCreateCampaign} from "./domain/campaigns/createCampaign.js";
import {makeListCampaigns} from "./domain/campaigns/listCampaign.js";
import { createPostgresUserRepository } from "./infra/userRepository.js";
import { hashPassword } from "./infra/passwordHasher.js";
import { makeCreateUser } from "./domain/users/createUser.js";
import { makeListUsers } from "./domain/users/listUsers.js";
import { makeGetUserById } from "./domain/users/getUserById.js";
import {makeGetCampaignById} from "./domain/campaigns/getCampaignById.js";
import { createPostgresCaptureRepository } from "./infra/captureRepository.js";
import { makeAddCampaignChannel } from "./domain/capture/addCampaignChannel.js";
import { makeListCampaignChannels } from "./domain/capture/listCampaignChannels.js";
import { makeCreateForm } from "./domain/capture/createForm.js";
import { makeGetFormById } from "./domain/capture/getFormById.js";
import { createPostgresLeadRepository } from "./infra/leadRepository.js";
import { makeCreateLead } from "./domain/leads/createLead.js";
// Aquí elegimos los adaptadores y conectamos las dependencias.
export const pool = createPostgresPool();
const campaignRepository = createPostgresCampaignRepository(pool);
const userRepository = createPostgresUserRepository(pool);
const captureRepository = createPostgresCaptureRepository(pool);
const leadRepository = createPostgresLeadRepository(pool);
// Agrupamos los casos de uso por funcionalidad.
export const useCases = {
  leads: {
    ...leadRepository,
    createLead: makeCreateLead({ leadRepository }),
  },
  capture: {
    addCampaignChannel: makeAddCampaignChannel({ captureRepository }),
    listCampaignChannels: makeListCampaignChannels({ captureRepository }),
    createForm: makeCreateForm({ captureRepository }),
    getFormById: makeGetFormById({ captureRepository }),
    // Sustituir solamente al integrar autorización real.
    authorize: async () => false,
  },
  users: {
    createUser: makeCreateUser({ userRepository, hashPassword }),
    listUsers: makeListUsers({ userRepository }),
    getUserById: makeGetUserById({ userRepository }),
    // Denegar hasta integrar autenticación y autorización reales.
    authorize: async () => false,
  },
  campaigns: {
    create: makeCreateCampaign({ campaignRepository }),
    list: makeListCampaigns({ campaignRepository }),
    getById: makeGetCampaignById({ campaignRepository })
  },
};

// Conservamos los comandos anteriores que importaban createCampaign.
export const createCampaign = useCases.campaigns.create;
export const listCampaigns = useCases.campaigns.list;

// La aplicación recibe los módulos que ya están implementados.
export const app = createApp(useCases);
