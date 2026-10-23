-- Demo data for Usage Metering and Quota Service
-- Company: API Key Test Company
-- Includes predefined plans, custom plans,
-- users, monthly usage, and request history.
-- Import into a fresh database after schema.sql.

BEGIN;

-- Company
INSERT INTO public.accounts VALUES ('467c3e2f-b656-4968-84f7-be1f2e84f3d4', 'API Key Test Company', '4fb67956c89480bb8aef7e914eab502e9357a86e1e43a0988d9d234e6c9d9943', NULL, '2026-10-22 15:29:13.677568+00');

-- Predefined and custom plans
INSERT INTO public.plans VALUES ('9411f862-cfa2-4253-a0f2-3eedf8427b10', NULL, 'account', 'Starter', 100, 20, true);
INSERT INTO public.plans VALUES ('d2ff5bbe-30d0-4c2a-b370-3c0a3bf61992', NULL, 'account', 'Pro', 1000, 100, true);
INSERT INTO public.plans VALUES ('9ca1ff5a-5dbc-43dc-aa26-492222c4358c', NULL, 'user', 'Basic', 10, 5, true);
INSERT INTO public.plans VALUES ('c7b9f103-4b58-43fb-9c6e-00b62a75737c', NULL, 'user', 'Premium', 100, 20, true);
INSERT INTO public.plans VALUES ('86872f03-df1d-4fcf-bc37-d81eff106a8e', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', 'user', 'VIP User', 250, 35, false);
INSERT INTO public.plans VALUES ('33431c38-1c40-431f-9325-03488a6375f2', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', 'account', 'Business Plus', 600, 20, false);
INSERT INTO public.plans VALUES ('4d077267-4da2-461a-b732-06e28a29be4f', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', 'user', 'Concurrency Test', 500, 20, false);
INSERT INTO public.plans VALUES ('90bbbf80-371a-4a9c-a473-d46f37393dfb', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', 'account', 'Race Condition Test', 274, 20, false);

-- Restore company's assigned plan
UPDATE public.accounts SET plan_id = '33431c38-1c40-431f-9325-03488a6375f2' WHERE id = '467c3e2f-b656-4968-84f7-be1f2e84f3d4';

-- Users
INSERT INTO public.app_users VALUES ('67da9a16-4f0b-4054-8fa5-f5eb11b75520', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', 'Test User B', '86872f03-df1d-4fcf-bc37-d81eff106a8e', '2026-10-23 10:52:41.721845+00');
INSERT INTO public.app_users VALUES ('355236b7-9b6b-496d-a9e5-43103cfb9da3', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', 'Test User A', '4d077267-4da2-461a-b732-06e28a29be4f', '2026-10-23 09:36:26.105578+00');

-- Monthly usage
INSERT INTO public.usage_totals VALUES ('467c3e2f-b656-4968-84f7-be1f2e84f3d4', NULL, '2026-10', 277, '5da845de-bac7-4657-887d-4c9f6286dc83');
INSERT INTO public.usage_totals VALUES ('467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '2026-10', 255, '782f3fd8-8c7d-411f-b523-f2d96a3ff06c');
INSERT INTO public.usage_totals VALUES ('467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', '2026-10', 22, '4a98cbb5-ddac-42af-b07c-ba54fe045581');

-- Request history
INSERT INTO public.requests VALUES ('9cc22ae4-2fe3-4928-8315-ad7a3baa9793', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '6a7e0c71-776c-4d9f-aec6-3bd94c6820f9', 10, true, NULL, NULL, '2026-10', '2026-10-23 10:19:59.864941+00');
INSERT INTO public.requests VALUES ('091d74ce-1e7d-483e-bb2d-a21d69a6ccb8', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '2d869321-3f7e-4d6b-a835-c70174b26c8d', 40, false, 'max_per_request', 'user', '2026-10', '2026-10-23 10:41:26.941434+00');
INSERT INTO public.requests VALUES ('f6ef4104-8f1f-400e-971a-d672870b452f', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', 'a955c3fd-c8b6-4814-a6c4-306757eb6823', 35, true, NULL, NULL, '2026-10', '2026-10-23 10:46:03.354149+00');
INSERT INTO public.requests VALUES ('94857c8b-9249-4548-83b2-e602176e52a7', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', 'ca58d889-331b-4fab-9130-f094a45fa0ad', 35, true, NULL, NULL, '2026-10', '2026-10-23 10:46:06.79658+00');
INSERT INTO public.requests VALUES ('d08e3fdd-f4d0-4933-ab36-3c2916b9c5cb', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '68a45fe5-6779-4fe5-86c6-e10bb16fe78b', 35, true, NULL, NULL, '2026-10', '2026-10-23 10:46:08.924621+00');
INSERT INTO public.requests VALUES ('a5bf9a70-0033-4aeb-8d63-069ba9194d88', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '41facb57-137a-4955-a965-b616bec77697', 35, true, NULL, NULL, '2026-10', '2026-10-23 10:46:10.445116+00');
INSERT INTO public.requests VALUES ('d35eb1d2-6cc8-467b-9d31-f584f3dbde12', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', 'e870d56d-678f-4990-ae4a-e730977ab341', 35, true, NULL, NULL, '2026-10', '2026-10-23 10:46:12.472326+00');
INSERT INTO public.requests VALUES ('a63d5082-c0e2-42a5-925e-eec25552e788', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '97db2009-d84f-456a-93b5-318cff00bc10', 35, true, NULL, NULL, '2026-10', '2026-10-23 10:46:14.096937+00');
INSERT INTO public.requests VALUES ('cd5e370b-58d7-4a43-a0c6-d6d5826c86b0', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '00f4a062-bbd0-4c72-943e-7b8222aafc18', 30, true, NULL, NULL, '2026-10', '2026-10-23 10:46:46.284427+00');
INSERT INTO public.requests VALUES ('7374d956-0c66-4521-b4cb-a13dd20b10e7', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '9eb7b7b4-47f6-4725-91e0-1c7f5dcefda8', 1, false, 'monthly_allowance', 'user', '2026-10', '2026-10-23 10:47:02.240468+00');
INSERT INTO public.requests VALUES ('f103fd59-6299-4f19-908b-d3c4980d9480', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', '6b2b4457-4351-4086-80f6-f8aa8840e137', 2, false, 'monthly_allowance', 'account', '2026-10', '2026-10-23 10:55:16.964181+00');
INSERT INTO public.requests VALUES ('cea4faec-b69d-42b6-b055-149963f07bb2', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', 'e4e49b0d-5b64-43e4-9e30-6586545118c3', 21, false, 'max_per_request', 'account', '2026-10', '2026-10-23 11:32:52.616771+00');
INSERT INTO public.requests VALUES ('d775a8bc-5fe0-4471-b1b2-65eed1b68842', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', 'd72c098f-eedc-479e-827e-afcec17d43da', 21, false, 'max_per_request', 'account', '2026-10', '2026-10-23 11:33:18.196414+00');
INSERT INTO public.requests VALUES ('0b4270ad-a2cf-4521-b1d4-e69e5c033bcb', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', 'ee885084-8b7b-4805-81d9-6097b7c5e09b', 1, false, 'monthly_allowance', 'user', '2026-10', '2026-10-23 11:33:35.681588+00');
INSERT INTO public.requests VALUES ('b8666307-7201-4bb9-b0b0-b07cb1fdfd47', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', '27bd9f6f-d3cc-4e51-b8a7-6987269d0e9d', 20, true, NULL, NULL, '2026-10', '2026-10-23 11:34:19.842843+00');
INSERT INTO public.requests VALUES ('cf3990b3-8e66-4830-8a06-a1d41c2bc6e9', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', '95d8a722-b641-400d-becd-41af28a9646b', 21, false, 'max_per_request', 'account', '2026-10', '2026-10-23 11:34:27.768144+00');
INSERT INTO public.requests VALUES ('c8c2eeef-8aab-45cc-ac66-05ad5d07e3bb', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '615825e4-5ba5-490c-8d98-a9f1a615c3ac', 1, false, 'monthly_allowance', 'user', '2026-10', '2026-10-23 11:41:36.554725+00');
INSERT INTO public.requests VALUES ('98adfe87-a3b5-4d2d-9ba8-c6d341b946f3', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', '04163f2c-6675-4d9b-bef1-985c3f92a9d3', 1, true, NULL, NULL, '2026-10', '2026-10-23 12:33:33.945483+00');
INSERT INTO public.requests VALUES ('fcaf8940-18a7-45d4-9e2d-fee3e8b8272d', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '9f443f6f-a732-445d-bce6-abfbbcf5d828', 1, true, NULL, NULL, '2026-10', '2026-10-23 12:50:34.780022+00');
INSERT INTO public.requests VALUES ('5efbec98-1d78-474d-94ca-0ee704f3ce48', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', 'af7a82d1-e7d1-4e59-b111-c6a677ddb24b', 1, true, NULL, NULL, '2026-10', '2026-10-23 12:50:34.780345+00');
INSERT INTO public.requests VALUES ('64bda0ee-816a-4de1-9635-dfbdf4baecd6', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '44a4b2ff-68c7-4c0e-a0ef-8a0dcdcac4e6', 1, true, NULL, NULL, '2026-10', '2026-10-23 12:53:04.984227+00');
INSERT INTO public.requests VALUES ('cad4be8d-5051-44d9-9d73-117e9ee5f91c', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '67da9a16-4f0b-4054-8fa5-f5eb11b75520', '10a056a5-f62c-4c61-bfb3-c1deb6a79341', 1, false, 'monthly_allowance', 'account', '2026-10', '2026-10-23 12:53:05.036206+00');
INSERT INTO public.requests VALUES ('2b2a71a6-9a6f-4425-91e9-68caea6d8453', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', '67b1c546-0a85-4ce8-80d8-a2ae4454335a', 2, true, NULL, NULL, '2026-10', '2026-10-23 13:10:36.553272+00');
INSERT INTO public.requests VALUES ('0475fa60-235c-4dc5-bb02-f8a383682acd', '467c3e2f-b656-4968-84f7-be1f2e84f3d4', '355236b7-9b6b-496d-a9e5-43103cfb9da3', 'da43ec51-35bd-4ce3-9a87-3f6a981605f0', 1, true, NULL, NULL, '2026-10', '2026-10-23 19:27:51.661314+00');

COMMIT;
