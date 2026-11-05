-- Moves every campus spot onto its real building. The first coordinates were
-- rough guesses, so on the Mapbox map several building pins sat on the wrong
-- building or on a road. The new points come from the building outlines in
-- OpenStreetMap, checked against Singapore's OneMap address points.
--
-- Only lat and lng change. Each spot keeps its id, so the items that point at
-- it are untouched. Spots are found by building, floor and area, which are
-- unique. The same values are in server/data/campus-spots.json for the seed.

-- SOE/SCIS 2
update campus_spots set lat = 1.297700, lng = 103.849020 where building = 'SOE/SCIS 2' and floor = 'Level 1' and area = 'lobby';
update campus_spots set lat = 1.297890, lng = 103.848880 where building = 'SOE/SCIS 2' and floor = 'Level 2' and area = 'seminar rooms';
update campus_spots set lat = 1.298040, lng = 103.848760 where building = 'SOE/SCIS 2' and floor = 'Level 4' and area = 'seminar rooms';

-- SCIS 1
update campus_spots set lat = 1.297320, lng = 103.849700 where building = 'SCIS 1' and floor = 'Level 1' and area = 'lobby';
update campus_spots set lat = 1.297440, lng = 103.849560 where building = 'SCIS 1' and floor = 'Level 2' and area = 'lift lobby';
update campus_spots set lat = 1.297530, lng = 103.849440 where building = 'SCIS 1' and floor = 'Level 2' and area = 'seminar rooms';
update campus_spots set lat = 1.297380, lng = 103.849800 where building = 'SCIS 1' and floor = 'Level 3' and area = 'seminar rooms';
update campus_spots set lat = 1.297280, lng = 103.849400 where building = 'SCIS 1' and floor = 'Level 4' and area = 'computer labs';

-- Li Ka Shing Library
update campus_spots set lat = 1.296500, lng = 103.850080 where building = 'Li Ka Shing Library' and floor = 'Level 1' and area = 'entrance';
update campus_spots set lat = 1.296300, lng = 103.850120 where building = 'Li Ka Shing Library' and floor = 'Level 2' and area = 'service desk';
update campus_spots set lat = 1.296180, lng = 103.849950 where building = 'Li Ka Shing Library' and floor = 'Level 3' and area = 'quiet study area';
update campus_spots set lat = 1.296120, lng = 103.850300 where building = 'Li Ka Shing Library' and floor = 'Level 4' and area = 'project rooms';

-- SOA
update campus_spots set lat = 1.295660, lng = 103.849880 where building = 'SOA' and floor = 'Level 1' and area = 'lobby';
update campus_spots set lat = 1.295820, lng = 103.849700 where building = 'SOA' and floor = 'Level 2' and area = 'seminar rooms';
update campus_spots set lat = 1.295550, lng = 103.849750 where building = 'SOA' and floor = 'Level 3' and area = 'seminar rooms';

-- LKCSB
update campus_spots set lat = 1.295300, lng = 103.850350 where building = 'LKCSB' and floor = 'Basement 1' and area = 'group study rooms';
update campus_spots set lat = 1.295200, lng = 103.850570 where building = 'LKCSB' and floor = 'Level 1' and area = 'atrium';
update campus_spots set lat = 1.295050, lng = 103.850750 where building = 'LKCSB' and floor = 'Level 2' and area = 'seminar rooms';
update campus_spots set lat = 1.295350, lng = 103.850800 where building = 'LKCSB' and floor = 'Level 3' and area = 'seminar rooms';

-- Administration Building
update campus_spots set lat = 1.296500, lng = 103.851950 where building = 'Administration Building' and floor = 'Level 1' and area = 'lobby security counter';

-- Concourse
update campus_spots set lat = 1.296306, lng = 103.850311 where building = 'Concourse' and floor = 'Basement 1' and area = 'Koufu food court';
update campus_spots set lat = 1.297138, lng = 103.849946 where building = 'Concourse' and floor = 'Basement 1' and area = 'walkway near SCIS 1';
update campus_spots set lat = 1.295451, lng = 103.850103 where building = 'Concourse' and floor = 'Basement 1' and area = 'walkway near LKCSB';
update campus_spots set lat = 1.296090, lng = 103.850490 where building = 'Concourse' and floor = 'Basement 1' and area = 'Bras Basah MRT exit';

-- Campus Green
update campus_spots set lat = 1.296850, lng = 103.850020 where building = 'Campus Green' and floor = 'Ground' and area = 'central lawn';
update campus_spots set lat = 1.296680, lng = 103.849900 where building = 'Campus Green' and floor = 'Ground' and area = 'benches by the library';

-- SOSS/CIS
update campus_spots set lat = 1.294560, lng = 103.848620 where building = 'SOSS/CIS' and floor = 'Level 1' and area = 'lobby';
update campus_spots set lat = 1.294700, lng = 103.848520 where building = 'SOSS/CIS' and floor = 'Level 2' and area = 'seminar rooms';

-- YPHSL
update campus_spots set lat = 1.295000, lng = 103.849250 where building = 'YPHSL' and floor = 'Level 1' and area = 'lobby';
update campus_spots set lat = 1.295170, lng = 103.848850 where building = 'YPHSL' and floor = 'Basement 1' and area = 'Kwa Geok Choo Law Library';

-- SMU Connexion
update campus_spots set lat = 1.295500, lng = 103.849350 where building = 'SMU Connexion' and floor = 'Level 1' and area = 'lobby';
update campus_spots set lat = 1.295700, lng = 103.849200 where building = 'SMU Connexion' and floor = 'Level 3' and area = 'active learning classrooms';
