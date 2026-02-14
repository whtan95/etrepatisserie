-- Flatten quote_requests table: add individual columns for each field
-- Run this in Supabase SQL Editor

-- =====================
-- EVENT FIELDS
-- =====================
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS event_name TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS event_type_other TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS estimated_guests INTEGER;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS event_location TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS location_area_name TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS location_venue_type TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS setup_date TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS dismantle_date TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS budget_from_rm TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS budget_to_rm TEXT;

-- =====================
-- CUSTOMER FIELDS
-- =====================
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS customer_company TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS customer_notes TEXT;

-- =====================
-- BRANDING FIELDS
-- =====================
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_include_logo BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_match_colours BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_logo_dessert BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_logo_packaging BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_logo_others BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_logo_others_text TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_colour_dessert BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_colour_packaging BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_colour_others BOOLEAN DEFAULT FALSE;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS branding_colour_others_text TEXT;

-- =====================
-- MENU FIELDS
-- =====================
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_customisation_level TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_customisation_notes TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_design_style TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_colour_direction TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_colour_specified TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_flavour TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_flavour_specified TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_dessert_size TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_packaging TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_categories TEXT[];  -- Array of categories
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_drinks TEXT[];  -- Array of drinks
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_drinks_other TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_item_quantities JSONB;  -- Keep as JSON (dynamic key-value)
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_reference_image1_name TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_reference_image1_url TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_reference_image2_name TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS menu_reference_image2_url TEXT;

-- =====================
-- MIGRATE EXISTING DATA
-- =====================
UPDATE quote_requests SET
  -- Event
  event_name = request->>'event'->>'eventName',
  event_date = request->'event'->>'eventDate',
  event_type = request->'event'->>'eventType',
  event_type_other = request->'event'->>'otherEventType',
  estimated_guests = (request->'event'->>'estimatedGuests')::INTEGER,
  event_location = request->'event'->>'eventLocation',
  location_area_name = request->'event'->>'otherAreaName',
  location_venue_type = request->'event'->>'otherVenueType',
  setup_date = request->'event'->>'takeOutSetupDate',
  dismantle_date = request->'event'->>'takeOutDismantleDate',
  budget_from_rm = request->'event'->>'budgetPerPersonFromRm',
  budget_to_rm = request->'event'->>'budgetPerPersonToRm',
  -- Customer
  customer_company = request->'customer'->>'companyName',
  customer_name = request->'customer'->>'name',
  customer_phone = request->'customer'->>'phone',
  customer_email = request->'customer'->>'email',
  customer_address = request->'customer'->>'address',
  customer_notes = request->'customer'->>'notes',
  -- Branding
  branding_include_logo = (request->'branding'->>'includeBrandLogo')::BOOLEAN,
  branding_match_colours = (request->'branding'->>'matchBrandColours')::BOOLEAN,
  branding_logo_dessert = (request->'branding'->>'logoOnDessert')::BOOLEAN,
  branding_logo_packaging = (request->'branding'->>'logoOnPackaging')::BOOLEAN,
  branding_logo_others = (request->'branding'->>'logoOnOthers')::BOOLEAN,
  branding_logo_others_text = request->'branding'->>'logoOnOthersText',
  branding_colour_dessert = (request->'branding'->>'colourOnDessert')::BOOLEAN,
  branding_colour_packaging = (request->'branding'->>'colourOnPackaging')::BOOLEAN,
  branding_colour_others = (request->'branding'->>'colourOnOthers')::BOOLEAN,
  branding_colour_others_text = request->'branding'->>'colourOnOthersText',
  -- Menu
  menu_customisation_level = request->'menu'->>'customisationLevel',
  menu_customisation_notes = request->'menu'->>'customisationNotes',
  menu_design_style = request->'menu'->>'preferredDesignStyle',
  menu_colour_direction = request->'menu'->>'colourDirection',
  menu_colour_specified = request->'menu'->>'colourDirectionClientSpecifiedText',
  menu_flavour = request->'menu'->>'preferredFlavour',
  menu_flavour_specified = request->'menu'->>'preferredFlavourClientSpecifiedText',
  menu_dessert_size = request->'menu'->>'dessertSize',
  menu_packaging = request->'menu'->>'packaging',
  menu_drinks_other = request->'menu'->>'drinksOtherText',
  menu_item_quantities = request->'menu'->'itemQuantities',
  menu_reference_image1_name = request->'menu'->>'referenceImage1Name',
  menu_reference_image1_url = request->'menu'->>'referenceImage1DataUrl',
  menu_reference_image2_name = request->'menu'->>'referenceImage2Name',
  menu_reference_image2_url = request->'menu'->>'referenceImage2DataUrl'
WHERE request IS NOT NULL;

-- Migrate arrays separately (PostgreSQL array handling)
UPDATE quote_requests SET
  menu_categories = ARRAY(SELECT jsonb_array_elements_text(request->'menu'->'categories')),
  menu_drinks = ARRAY(SELECT jsonb_array_elements_text(request->'menu'->'drinks'))
WHERE request IS NOT NULL
  AND request->'menu'->'categories' IS NOT NULL;

-- =====================
-- DONE!
-- =====================
-- Note: We keep the 'request' column for now as backup
-- You can drop it later with: ALTER TABLE quote_requests DROP COLUMN request;
