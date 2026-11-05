// Decides whether the seed script may wipe the database it is pointed at.
// Returns an error message, or null when it is safe to go ahead.
//   target     DB_TARGET from the settings file ('test' or 'live')
//   wantsLive  the command was run with --live
//   confirmed  the command was run with --yes
function checkSeedTarget({ target, wantsLive, confirmed }) {
  if (target !== 'test' && target !== 'live') {
    return 'Refusing to seed: DB_TARGET in the settings file must be "test" or "live".';
  }
  if (wantsLive !== (target === 'live')) {
    return `Refusing to seed: asked for ${wantsLive ? 'live' : 'test'} but the settings file says DB_TARGET=${target}.`;
  }
  if (target === 'live' && !confirmed) {
    return 'This wipes the LIVE database. Run again with: npm run seed:live -- --yes';
  }
  return null;
}

module.exports = { checkSeedTarget };
