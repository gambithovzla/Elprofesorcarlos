-- Cursos iniciales (mismos 3 programas del sitio).
-- Precios de ejemplo: se ajustan desde el panel /admin.

INSERT INTO courses (slug, title, description, price_pen, sessions_included)
VALUES
  ('oratoria',
   'Oratoria y presentaciones eficaces',
   'Habla en público con estructura, calma y convicción. Proyección vocal, dominio del miedo escénico y discursos que perduran en la memoria de la audiencia.',
   199.00, 3),
  ('comunicacion-asertiva',
   'Comunicación asertiva',
   'Mensajes claros en cualquier medio: reuniones, correos y negociaciones. Presencia sin ruido. Influencia sin imposición.',
   199.00, 3),
  ('liderazgo',
   'Liderazgo y equipos',
   'Inspirar, alinear y decidir con criterio. Liderazgo situacional, feedback de alto impacto y conversaciones difíciles con método.',
   199.00, 3)
ON CONFLICT (slug) DO NOTHING;
