-- Preserve existing member IDs and relationships; abort rather than merge conflicting accounts.
DO $$
DECLARE target_id integer;
BEGIN
  IF (SELECT count(*) FROM members WHERE lower(username) = 'superadmin' OR lower(email) = 'vipbossceo@gmail.com') > 1 THEN
    RAISE EXCEPTION 'Admin username and email belong to separate accounts; resolve the conflict before deploying';
  END IF;
  SELECT id INTO target_id FROM members WHERE lower(username) = 'superadmin' OR lower(email) = 'vipbossceo@gmail.com';
  IF target_id IS NULL THEN
    INSERT INTO members (member_code, username, email, full_name, password_hash, is_admin)
    VALUES ('OM-ADMIN-' || nextval('members_id_seq'), 'superadmin', 'vipbossceo@gmail.com', 'Administrator', 'scrypt$96f4e9047d1a8f261dfd8956967c18dc$954fdc84bc3dc0db3dcb5ce12beda854bbf8a8ae1e4a5762f49fb8ccfcd9af6b4a0709327a9e0c12ad3c458df86b83cbbc266159cd38f136dfe7843446073c76', true)
    RETURNING id INTO target_id;
  ELSE
    UPDATE members SET username = 'superadmin', email = 'vipbossceo@gmail.com', password_hash = 'scrypt$96f4e9047d1a8f261dfd8956967c18dc$954fdc84bc3dc0db3dcb5ce12beda854bbf8a8ae1e4a5762f49fb8ccfcd9af6b4a0709327a9e0c12ad3c458df86b83cbbc266159cd38f136dfe7843446073c76', is_admin = true, is_suspended = false, reset_requested_at = NULL WHERE id = target_id;
  END IF;
  DELETE FROM sessions WHERE member_id = target_id OR member_id IN (SELECT id FROM members WHERE is_admin);
  DELETE FROM password_resets WHERE member_id = target_id;
  UPDATE members SET is_admin = (id = target_id);
END $$;
