-- Campus places checked against SMU's facility booking system (October 2026).
-- Each building now has the levels the booking system lists (SOE/SCIS 2 goes
-- up to Level 7, SOSS/CIS and YPHSL have a Basement 2, YPHSL a Level 6, Li Ka
-- Shing Library a Basement 1), and each level offers the building's own room
-- types: classrooms, group study rooms, seminar rooms, meeting pods, project
-- rooms, phone booths, study booths and chatterboxes. Where SMU's room numbers
-- say which level a room type is on, it is only on those levels. The Sports
-- Hall (Administration Building Level 3), swimming pool (Level 6), gym and Arts
-- & Culture Centre (SOE/SCIS 2 Basement 1) and Basement Studio (LKCSB
-- Basement 1) are added from SMU's Student Amenities page.
--
-- Rows that stay keep their id. Rows that go (group study rooms in SOSS/CIS,
-- which has none, and offices that no source confirms) first hand anything
-- that points at them to a row on the same level, so no item or meetup is lost.
-- The same list is in server/data/campus-spots.json for the seed.

-- 1. Rename
update campus_spots set area = 'classrooms' where building = 'SMU Connexion' and floor = 'Level 3' and area = 'active learning classrooms';

-- 2. Add the new rows (skipped if a row with the same name is already there)
insert into campus_spots (building, floor, area, lat, lng, linked_buildings, is_collection_point) values
  ('SOE/SCIS 2', 'Basement 1', 'Gymnasium & Fitness Centre', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Basement 1', 'Arts & Culture Centre', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Basement 1', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 1', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 2', 'classrooms', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 2', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 3', 'classrooms', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 3', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 4', 'classrooms', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 4', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 5', 'classrooms', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 5', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 6', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 6', 'toilets', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 6', 'lifts, stairs & corridors', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 7', 'meeting pods', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 7', 'toilets', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SOE/SCIS 2', 'Level 7', 'lifts, stairs & corridors', 1.297877, 103.848887, array['Concourse', 'SCIS 1']::text[], false),
  ('SCIS 1', 'Basement 1', 'classrooms', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('SCIS 1', 'Basement 1', 'meeting pods', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('SCIS 1', 'Level 1', 'meeting pods', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('SCIS 1', 'Level 2', 'meeting pods', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('SCIS 1', 'Level 3', 'classrooms', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('SCIS 1', 'Level 3', 'meeting pods', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('SCIS 1', 'Level 4', 'meeting pods', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('SCIS 1', 'Level 5', 'meeting pods', 1.297390, 103.849580, array['Concourse', 'SOE/SCIS 2', 'Li Ka Shing Library']::text[], false),
  ('Li Ka Shing Library', 'Basement 1', 'meeting pods', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Basement 1', 'study booths', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Basement 1', 'toilets', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Basement 1', 'lifts, stairs & corridors', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 2', 'phone booths', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 2', 'meeting pods', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 2', 'study booths', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 3', 'meeting pods', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 3', 'study booths', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 4', 'meeting pods', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 4', 'study booths', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 5', 'meeting pods', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('Li Ka Shing Library', 'Level 5', 'study booths', 1.296275, 103.850113, array['Concourse', 'SCIS 1', 'SOA', 'Campus Green']::text[], false),
  ('SOA', 'Basement 1', 'meeting pods', 1.295677, 103.849777, array['Concourse', 'Li Ka Shing Library', 'LKCSB']::text[], false),
  ('SOA', 'Level 1', 'meeting pods', 1.295677, 103.849777, array['Concourse', 'Li Ka Shing Library', 'LKCSB']::text[], false),
  ('SOA', 'Level 2', 'classrooms', 1.295677, 103.849777, array['Concourse', 'Li Ka Shing Library', 'LKCSB']::text[], false),
  ('SOA', 'Level 2', 'meeting pods', 1.295677, 103.849777, array['Concourse', 'Li Ka Shing Library', 'LKCSB']::text[], false),
  ('SOA', 'Level 3', 'meeting pods', 1.295677, 103.849777, array['Concourse', 'Li Ka Shing Library', 'LKCSB']::text[], false),
  ('SOA', 'Level 4', 'meeting pods', 1.295677, 103.849777, array['Concourse', 'Li Ka Shing Library', 'LKCSB']::text[], false),
  ('SOA', 'Level 5', 'meeting pods', 1.295677, 103.849777, array['Concourse', 'Li Ka Shing Library', 'LKCSB']::text[], false),
  ('LKCSB', 'Basement 1', 'Basement Studio', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Basement 1', 'meeting pods', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 1', 'group study rooms', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 1', 'meeting pods', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 2', 'classrooms', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 2', 'meeting pods', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 3', 'classrooms', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 3', 'meeting pods', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 4', 'meeting pods', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('LKCSB', 'Level 5', 'meeting pods', 1.295225, 103.850618, array['Concourse', 'SOA']::text[], false),
  ('Administration Building', 'Level 3', 'Sports Hall', 1.296500, 103.851950, array['Concourse', 'Campus Green']::text[], false),
  ('Administration Building', 'Level 6', 'swimming pool', 1.296500, 103.851950, array['Concourse', 'Campus Green']::text[], false),
  ('SOSS/CIS', 'Basement 2', 'seminar rooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 2', 'classrooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 2', 'meeting pods', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 2', 'toilets', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 2', 'lifts, stairs & corridors', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 1', 'seminar rooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 1', 'classrooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 1', 'meeting pods', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 1', 'toilets', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Basement 1', 'lifts, stairs & corridors', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 1', 'seminar rooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 1', 'classrooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 1', 'meeting pods', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 2', 'classrooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 2', 'meeting pods', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 3', 'classrooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 3', 'meeting pods', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 4', 'classrooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 4', 'meeting pods', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 5', 'seminar rooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 5', 'classrooms', 1.294630, 103.848570, array[]::text[], false),
  ('SOSS/CIS', 'Level 5', 'meeting pods', 1.294630, 103.848570, array[]::text[], false),
  ('YPHSL', 'Basement 2', 'seminar rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 2', 'group study rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 2', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 2', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 2', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 2', 'toilets', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 2', 'lifts, stairs & corridors', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 1', 'seminar rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 1', 'group study rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 1', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 1', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Basement 1', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 1', 'seminar rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 1', 'group study rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 1', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 1', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 1', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 2', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 2', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 2', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 3', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 3', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 3', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 4', 'seminar rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 4', 'group study rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 4', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 4', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 4', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 5', 'seminar rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 5', 'group study rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 5', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 5', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 5', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 6', 'seminar rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 6', 'group study rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 6', 'classrooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 6', 'project rooms', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 6', 'meeting pods', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 6', 'toilets', 1.295085, 103.849050, array[]::text[], false),
  ('YPHSL', 'Level 6', 'lifts, stairs & corridors', 1.295085, 103.849050, array[]::text[], false),
  ('SMU Connexion', 'Level 1', 'chatterboxes', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 1', 'classrooms', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 1', 'meeting pods', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 1', 'study booths', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 2', 'chatterboxes', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 2', 'classrooms', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 2', 'meeting pods', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 2', 'study booths', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 3', 'chatterboxes', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 3', 'meeting pods', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 3', 'study booths', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 4', 'chatterboxes', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 4', 'classrooms', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 4', 'meeting pods', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 4', 'study booths', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 5', 'chatterboxes', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 5', 'classrooms', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 5', 'meeting pods', 1.295600, 103.849275, array[]::text[], false),
  ('SMU Connexion', 'Level 5', 'study booths', 1.295600, 103.849275, array[]::text[], false)
on conflict (building, floor, area) do nothing;

-- 3. Move anything that points at a row that goes, then remove the row
update item_trail_points set spot_id = (select id from campus_spots where building = 'SCIS 1' and floor = 'Level 5' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'SCIS 1' and floor = 'Level 5' and area = 'offices');
update handoffs set spot_id = (select id from campus_spots where building = 'SCIS 1' and floor = 'Level 5' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'SCIS 1' and floor = 'Level 5' and area = 'offices');
delete from campus_spots where building = 'SCIS 1' and floor = 'Level 5' and area = 'offices';
update item_trail_points set spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 4' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 4' and area = 'offices');
update handoffs set spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 4' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 4' and area = 'offices');
delete from campus_spots where building = 'SOA' and floor = 'Level 4' and area = 'offices';
update item_trail_points set spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 5' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 5' and area = 'offices');
update handoffs set spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 5' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'SOA' and floor = 'Level 5' and area = 'offices');
delete from campus_spots where building = 'SOA' and floor = 'Level 5' and area = 'offices';
update item_trail_points set spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 2' and area = 'study areas') where spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 2' and area = 'group study rooms');
update handoffs set spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 2' and area = 'study areas') where spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 2' and area = 'group study rooms');
delete from campus_spots where building = 'SOSS/CIS' and floor = 'Level 2' and area = 'group study rooms';
update item_trail_points set spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 3' and area = 'study areas') where spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 3' and area = 'group study rooms');
update handoffs set spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 3' and area = 'study areas') where spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 3' and area = 'group study rooms');
delete from campus_spots where building = 'SOSS/CIS' and floor = 'Level 3' and area = 'group study rooms';
update item_trail_points set spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 4' and area = 'study areas') where spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 4' and area = 'group study rooms');
update handoffs set spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 4' and area = 'study areas') where spot_id = (select id from campus_spots where building = 'SOSS/CIS' and floor = 'Level 4' and area = 'group study rooms');
delete from campus_spots where building = 'SOSS/CIS' and floor = 'Level 4' and area = 'group study rooms';
update item_trail_points set spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 4' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 4' and area = 'offices');
update handoffs set spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 4' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 4' and area = 'offices');
delete from campus_spots where building = 'YPHSL' and floor = 'Level 4' and area = 'offices';
update item_trail_points set spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 5' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 5' and area = 'offices');
update handoffs set spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 5' and area = 'lifts, stairs & corridors') where spot_id = (select id from campus_spots where building = 'YPHSL' and floor = 'Level 5' and area = 'offices');
delete from campus_spots where building = 'YPHSL' and floor = 'Level 5' and area = 'offices';
