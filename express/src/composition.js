import { createApp } from "./app.js";
import { createPostgresPool } from "./infra/postgres.js";
import {createPostgresCampaignRepository} from "./infra/campaignRepository.js";
import {makeCreateCampaign} from "./domain/campaigns/createCampaign.js";
import {makeListCampaigns} from "./domain/campaigns/listCampaign.js";
import { createPostgresUserRepository } from "./infra/userRepository.js";
import { hashPassword, verifyPassword } from "./infra/passwordHasher.js";
import { makeCreateUser } from "./domain/users/createUser.js";
import { makeLogin } from "./domain/users/login.js";
import { makeListUsers } from "./domain/users/listUsers.js";
import { makeGetUserById } from "./domain/users/getUserById.js";
import {makeGetCampaignById} from "./domain/campaigns/getCampaignById.js";
import { createPostgresCaptureRepository } from "./infra/captureRepository.js";
import { makeAddCampaignChannel } from "./domain/capture/addCampaignChannel.js";
import { makeListCampaignChannels } from "./domain/capture/listCampaignChannels.js";
import { makeCreateForm } from "./domain/capture/createForm.js";
import { makeGetFormById } from "./domain/capture/getFormById.js";
import { createJwtAuthenticator, createJwtIssuer } from "./infra/jwtAuthenticator.js";
import { createPostgresLeadRepository } from "./infra/leadRepository.js";
import { makeCreateLead } from "./domain/leads/createLead.js";
import { makeApplyQualificationData } from "./domain/leads/applyQualificationData.js";
import { makeQualificationUseCases } from "./domain/leads/qualifyLead.js";
import { createPostgresQualificationRepository } from "./infra/qualificationRepository.js";
import { createPostgresReadiness } from "./infra/postgresReadiness.js";
import { createPostgresConversationTurnRepository } from "./infra/conversationTurnRepository.js";
import { makeRunConversationTurn } from "./domain/ai/runConversationTurn.js";
import { readFile } from "node:fs/promises";

// Los esquemas T4 se leen del contrato compartido. La misma ruta relativa
// funciona en local (express/src -> contracts/) y en Docker (/app/src -> /contracts/).
const schemaDirectory = new URL("../../contracts/schemas/", import.meta.url);

function loadSchema(name) {
  return readFile(new URL(name, schemaDirectory), "utf8").then(JSON.parse);
}

/**
 * Arma el turno conversacional solo si el gateway y la clave privada están
 * configurados.
 *
 * Sigue la convención del resto de la composición: sin configuración la
 * operación no existe (el router responde 503); con configuración a medias o
 * inválida el proceso no arranca, para no fingir un asistente que no funciona.
 */
async function buildConversationTurn({ conversationTurnRepository }) {
  const baseUrl = process.env.AI_GATEWAY_URL;
  const privateKeyFile = process.env.SERVICE_JWT_PRIVATE_KEY_FILE;
  if (!baseUrl && !privateKeyFile) return null;
  if (!baseUrl || !privateKeyFile) {
    throw new Error("AI_GATEWAY_URL y SERVICE_JWT_PRIVATE_KEY_FILE deben configurarse juntos.");
  }

  let origin;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    throw new Error("AI_GATEWAY_URL no es una URL válida.");
  }

  // El emisor lee la clave privada una sola vez y firma un token por llamada.
  let privateKeyPem;
  try {
    privateKeyPem = await readFile(privateKeyFile, "utf8");
  } catch {
    // Un despliegue mal provisionado debe fallar con una causa clara, no con ENOENT.
    throw new Error(
      "No se pudo leer SERVICE_JWT_PRIVATE_KEY_FILE. Genere el par con scripts/generate-service-jwt-keys.mjs.",
    );
  }
  // Si el turno está deshabilitado no se cargan sus adaptadores ni AJV.
  const [{ createServiceTokenProvider }, { createAiGatewayClient }] = await Promise.all([
    import("./infra/serviceJwtIssuer.js"),
    import("./infra/aiGatewayClient.js"),
  ]);
  const getServiceToken = await createServiceTokenProvider({ privateKeyPem });

  const aiGateway = createAiGatewayClient({
    baseUrl,
    getServiceToken,
    schemas: {
      request: await loadSchema("request.schema.json"),
      response: await loadSchema("response.schema.json"),
      result: await loadSchema("result.schema.json"),
      leadData: await loadSchema("lead-data.schema.json"),
    },
    // El cliente exige declarar el origen y el entorno para HTTP sin cifrar.
    httpAuthorization: { origin, environment: process.env.NODE_ENV },
  });

  return makeRunConversationTurn({ conversationTurnRepository, aiGateway });
}

// Aquí elegimos los adaptadores y conectamos las dependencias.
export const pool = createPostgresPool();
const campaignRepository = createPostgresCampaignRepository(pool);
const userRepository = createPostgresUserRepository(pool);
const captureRepository = createPostgresCaptureRepository(pool);
const leadRepository = createPostgresLeadRepository(pool);
const qualificationRepository = createPostgresQualificationRepository(pool);
const conversationTurnRepository = createPostgresConversationTurnRepository(pool);
// Puede ser null si el gateway de IA no está configurado en este despliegue.
const runConversationTurn = await buildConversationTurn({ conversationTurnRepository });
// La clave HS256 de usuarios se usa solo dentro de Express.
const secretHex = process.env.JWT_SECRET_HEX;
const authenticate = createJwtAuthenticator({
  secretHex,
  findUserById: (id) => userRepository.findById(id),
});
const issueToken = createJwtIssuer({ secretHex });
// Agrupamos los casos de uso por funcionalidad.
export const useCases = {
  checkReadiness: createPostgresReadiness(pool),
  auth: {
    login: issueToken ? makeLogin({ userRepository, verifyPassword, issueToken }) : null,
  },
  leads: {
    ...leadRepository,
    createLead: makeCreateLead({ leadRepository }),
    // Null cuando el gateway de IA no está configurado; el router responde 503.
    authenticate,
    runConversationTurn,
  },
  // Los casos de uso de captación comparten el mismo adaptador de persistencia.
  capture: {
    addCampaignChannel: makeAddCampaignChannel({ captureRepository }),
    listCampaignChannels: makeListCampaignChannels({ captureRepository }),
    createForm: makeCreateForm({ captureRepository }),
    getFormById: makeGetFormById({ captureRepository }),
    // El JWT identifica al usuario; sus permisos se consultan en la base.
    authenticate,
  },
  qualification: {
    // Comparte la identidad JWT de usuarios, sin cambiar permisos de otras rutas.
    authenticate,
    applyQualificationData: makeApplyQualificationData({ qualificationRepository }),
    ...makeQualificationUseCases({ qualificationRepository }),
  },
  users: {
    createUser: makeCreateUser({ userRepository, hashPassword }),
    listUsers: makeListUsers({ userRepository }),
    getUserById: makeGetUserById({ userRepository }),
    authenticate,
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
