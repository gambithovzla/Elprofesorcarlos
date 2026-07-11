'use strict';

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const purchasesRouter = require('./routes/purchases');
const accessRouter = require('./routes/access');
const adminRouter = require('./routes/admin');

const app = express();
app.set('trust proxy', 1); // Railway corre detrás de proxy

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

/* API */
app.use('/api', purchasesRouter);
app.use('/api', accessRouter);
app.use('/api/admin', adminRouter);

/* Descarga protegida del PDF */
app.get('/download/:token', accessRouter.downloadHandler);

/* Sitio estático */
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

/* Manejador de errores */
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno. Inténtalo de nuevo en unos minutos.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`El Profesor Carlos — servidor escuchando en puerto ${PORT}`);
});
