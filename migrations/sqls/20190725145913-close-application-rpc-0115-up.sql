/* db-migrate create close-application-rpc-0115 -e pg-staging */


--https://github.com/smartdevicelink/sdl_core/pull/2948/files
--This new RPC should be available to all applications so it belongs in Base-4 along with things like Alert.
INSERT INTO function_group_hmi_levels(function_group_id, permission_name, hmi_level)
SELECT id AS function_group_id, 'CloseApplication' AS permission_name, 'FULL' AS hmi_level
FROM function_group_info
WHERE property_name = 'Base-4'
  AND NOT EXISTS(SELECT 1 FROM function_group_hmi_levels where permission_name='CloseApplication' and hmi_level='FULL');

INSERT INTO function_group_hmi_levels(function_group_id, permission_name, hmi_level)
SELECT id AS function_group_id, 'CloseApplication' AS permission_name, 'LIMITED' AS hmi_level
FROM function_group_info
WHERE property_name = 'Base-4'
  AND NOT EXISTS(SELECT 1 FROM function_group_hmi_levels where permission_name='CloseApplication' and hmi_level='LIMITED');

INSERT INTO function_group_hmi_levels(function_group_id, permission_name, hmi_level)
SELECT id AS function_group_id, 'CloseApplication' AS permission_name, 'BACKGROUND' AS hmi_level
FROM function_group_info
WHERE property_name = 'Base-4'
  AND NOT EXISTS(SELECT 1 FROM function_group_hmi_levels where permission_name='CloseApplication' and hmi_level='BACKGROUND');
