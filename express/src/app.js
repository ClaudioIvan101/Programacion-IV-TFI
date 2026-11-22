import express from "express";
import routes from "./routes/index.js";
import { createCampaignRouter } from "./routes/campaigns.js";
import { createUserRouter } from "./routes/users.js";
import { createAuthRouter } from "./routes/auth.js";
import { createCaptureRouter } from "./routes/capture.js";
import { createLeadRouter } from "./routes/leads.js";
import { createQualificationRouter } from "./routes/qualification.js";
import notFound from "./middlewares/notFound.js";
import errorHandler from "./middlewares/errorHandler.js";

export function createApp({ campaigns, users, capture, leads, auth, qualification } = {}) {
  const app = express();

  app.disable("x-powered-by");

  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    next();
  });

  // Primero interpretamos el JSON; después ejecutamos las rutas.
  app.use(express.json({ limit: "100kb" }));

  // Conservamos las rutas existentes.
  app.use(routes);

  if (capture !== undefined) app.use(createCaptureRouter(capture));
  // Registra las rutas de leads, conversaciones y mensajes en Express.
  if (leads !== undefined) app.use(createLeadRouter(leads));
  if (qualification !== undefined) app.use(createQualificationRouter(qualification));
  if (auth !== undefined) app.use("/auth", createAuthRouter(auth));

  if (users !== undefined) {
    app.use("/users", createUserRouter(users));
  }

  if (campaigns !== undefined) {
    
    app.use( "/campaigns", createCampaignRouter({ 
      // El router recibe solamente la función que necesita.
        createCampaign: campaigns.create,
        listCampaigns: campaigns.list,
        getCampaignById: campaigns.getById,
      }),
    );
  }

  // Estos manejadores siempre quedan después de las rutas.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

// Mantiene las pruebas generales independientes de PostgreSQL.
// El servidor real utiliza la app preparada en composition.js.
export default createApp();
