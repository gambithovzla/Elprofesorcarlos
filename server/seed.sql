-- Curso único que se vende en la página: Dominio de la Palabra.
-- Precio referencial: se ajusta desde el panel /admin.

INSERT INTO courses (slug, title, description, price_pen, sessions_included)
VALUES
  ('dominio-de-la-palabra',
   'Dominio de la Palabra',
   'Curso de oratoria y comunicación efectiva basado en el Método FARO®. Controla los nervios, domina tu voz y tu dicción, y habla con seguridad, claridad y presencia. Clases en vivo, enfoque 100 % práctico y mentorías de acompañamiento.',
   199.00, 3)
ON CONFLICT (slug) DO NOTHING;

-- Retirar del catálogo los cursos de prueba (se conservan las filas por
-- integridad referencial con compras existentes).
UPDATE courses SET active = FALSE
 WHERE slug IN ('oratoria', 'comunicacion-asertiva', 'liderazgo');
