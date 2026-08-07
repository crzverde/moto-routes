CREATE TABLE route_photos (
    id UUID PRIMARY KEY,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    captured_at TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_route_photos_route_id ON route_photos(route_id);
