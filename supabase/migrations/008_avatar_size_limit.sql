-- Raise avatars bucket limit (client now compresses; keep headroom)
update storage.buckets
set file_size_limit = 5242880 -- 5 MB
where id = 'avatars';
