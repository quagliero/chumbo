const Rules = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">League Rules</h1>

      <section className="mb-12 marker:font-semibold marker:[content:counters(section,'.')]">
        <ol className="pl-4 [counter-reset:section] space-y-6">
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">Bylaws</h2>
            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                This is a benevolent dictatorship. In the case of any doubt or
                ambiguity, or if he decides to disregard any of the below rules,
                The Commissioner's Will is final.
              </li>
            </ol>
          </li>
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">Rosters</h2>
            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                Setting your lineup is your responsibility. If you will be
                unable to set a lineup for any reason, you must inform the
                league of any changes you would like to be made ahead of time so
                the commissioner can action them.
              </li>
              <li className="pl-1 [counter-increment:section]">
                Being asleep is not a valid reason for not being able to set a
                lineup. Nobody cares. Work harder. Valid reasons for not being
                able to set a lineup include:
                <ul className="pl-4 [counter-reset:section] space-y-1 ml-4">
                  <li className="pl-1 [counter-increment:section]">
                    You are on a flight.
                  </li>
                  <li className="pl-1 [counter-increment:section]">
                    You are dealing with a medical emergency.
                  </li>
                </ul>
              </li>
              <li className="pl-1 [counter-increment:section]">
                If there is a surprise inactive of which there was no prior
                warning and you are unable to edit your roster, the commissioner
                may replace that player with a player from your bench. If there
                are multiple players who are eligible it will be the player that
                had the highest projection on Sleeper.
                <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
                  <li className="pl-1 [counter-increment:section]">
                    An inactive is not a surprise if:
                    <ul className="pl-4 [counter-reset:section] space-y-1 ml-4">
                      <li className="pl-1 [counter-increment:section]">
                        The player is on the injury report.
                      </li>
                      <li className="pl-1 [counter-increment:section]">
                        The player had missed or limited practices.
                      </li>
                      <li className="pl-1 [counter-increment:section]">
                        There had been news reports about the player potentially
                        being inactive.
                      </li>
                    </ul>
                  </li>
                </ol>
              </li>
              <li className="pl-1 [counter-increment:section]">
                Once you have been eliminated from playoff contention, you are
                no longer allowed to participate in waivers or make trades. You
                may use Free Agency to fill out holes in your roster to field
                lineups for your remaining games, but this can only happen once
                waivers have run.
              </li>
              <li className="pl-1 [counter-increment:section]">
                Rosters are locked once the regular season ends and that team is
                eliminated from the playoffs.
              </li>
            </ol>
          </li>
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">Trades</h2>
            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                A trade can only be completed between parties who are eligible
                to make the playoffs. This is defined as a greater than 0.1%
                playoff probability.
              </li>
              <li className="pl-1 [counter-increment:section]">
                A trade is final and permanent, players are not allowed to be
                'loaned' with an agreement to return them.
              </li>
              <li className="pl-1 [counter-increment:section]">
                A trade must benefit your team. In the event of clear and
                obvious collusion, the commissioner reserves the right to
                intervene and call the trade off. Just because a trade 'looks
                bad', does not mean it is collusion.
              </li>
              <li className="pl-1 [counter-increment:section]">
                A trade is only final once it has been confirmed in the app.
                Verbal agreements are not enforceable. Neither are public
                announcements.
              </li>
              <li className="pl-1 [counter-increment:section]">
                You cannot drop a player received via trade - that has been
                roster locked that gameweek - until all weekly games have
                finished. In the event of this, the trade will be reverted by
                the commissioner.
                <br />
                <span className="italic">
                  (Added Week 1, 2025 with a 9:2 vote in favour, to prevent the
                  swapping of locked players to free up a roster spot during a
                  gameweek.)
                </span>
              </li>
            </ol>
          </li>
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">Playoffs</h2>
            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                The top 6 teams (ordered by wins) make the playoffs, with the
                top 2 seeds receiving byes.
                <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
                  <li className="pl-1 [counter-increment:section]">
                    Tie break order:
                    <div>
                      <div>1. Points for (highest)</div>
                      <div>2. Points against (highest)</div>
                      <div>3. Strength of schedule (highest)</div>
                      <div>4. Random</div>
                    </div>
                  </li>
                </ol>
              </li>
              <li className="pl-1 [counter-increment:section]">
                The highest seed plays the lowest seed, and we re-seed each
                round to ensure the highest seed always plays the lowest seed.
              </li>
              <li className="pl-1 [counter-increment:section]">
                Teams that do not make the playoffs do not compete in a
                consolation bracket and their season is over.
              </li>
            </ol>
          </li>
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">Scumbo</h2>
            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                The lowest ranked (by wins) team of the regular season is known
                as the Scumbo.
              </li>
              <li className="pl-1 [counter-increment:section]">
                If two or more teams are tied for the lowest rank, the team with
                the lowest points scored is the Scumbo, if this is somehow a
                tie, then the H2H record is used, if this is also a tie, then
                strength of victory will be calculated and the team with the
                lowest strength of victory is the Scumbo.
              </li>
            </ol>
          </li>
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">The Draft</h2>
            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                Teams that attend the draft increase their chances of having the
                top pick in next year's draft.
              </li>
              <li className="pl-1 [counter-increment:section]">
                Draft Order is calculated with a Monte Carlo sim that randomly
                sorts all draft attendees into a list 10,000 times, and this is
                then sorted by their average position in that list, with Scumbo
                being last, and any remaining teams being placed randomly
                between these.
              </li>
            </ol>
          </li>
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">Rule Changes</h2>
            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                Anyone can propose a rule change. This can be for scoring,
                roster settings, or any other rule.
              </li>
              <li className="pl-1 [counter-increment:section]">
                If a rule change is proposed, it will be put to a vote by the
                league.
              </li>
              <li className="pl-1 [counter-increment:section]">
                If the rule change receives 6 votes in its favour, the
                commissioner will make a deciding ruling.
              </li>
              <li className="pl-1 [counter-increment:section]">
                If the rule change receives 9 votes in its favour, it will be
                implemented without a ruling.
              </li>
            </ol>
          </li>
          <li className="[counter-increment:section]">
            <h2 className="font-semibold ml-1">Pandemics (e.g. COVID-19)</h2>

            <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
              <li className="pl-1 [counter-increment:section]">
                <h3 className="font-semibold ml-1">
                  Pickup rules for postponed game weeks
                </h3>
              </li>
              <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
                <li className="pl-1 [counter-increment:section]">
                  You can pickup cover for your starting lineup and place
                  affected players in the IR spot.
                </li>
                <li className="pl-1 [counter-increment:section]">
                  You don't have to play them, but there has to be a reasonable
                  assumption that you would.
                </li>
                <li className="pl-1 [counter-increment:section]">
                  You have to nominate who the pickup is a short term
                  replacement for.
                </li>
                <li className="pl-1 [counter-increment:section]">
                  The pickup has to be dropped at the latest on Tuesday, so that
                  they enter the waiver cycle.
                </li>
                <li className="pl-1 [counter-increment:section]">
                  The process is standalone for a given game week. E.g. if a
                  game is cancelled the following week too, again you have the
                  ability to pick up another player from the waiver wire and
                  nominate them as a replacement.
                </li>
                <li className="pl-1 [counter-increment:section]">
                  Any grey areas, where the player is not believed to be a
                  replacement player will be subject to the Commish having final
                  ruling.
                </li>
              </ol>
              <li className="pl-1 [counter-increment:section]">
                <h3 className="font-semibold ml-1">
                  Pickup rules for players who are on the NFL's official
                  [pandemic] list
                </h3>
                <ol className="pl-4 [counter-reset:section] space-y-2 ml-4">
                  <li className="pl-1 [counter-increment:section]">
                    These players can go onto the IR spot and you can pick up
                    anyone as you please.
                  </li>
                  <li className="pl-1 [counter-increment:section]">
                    Pickups do not require nomination.
                  </li>
                  <li className="pl-1 [counter-increment:section]">
                    Once they are covid free and the tag is removed, you make
                    the decision whether to roster or keep them.
                  </li>
                </ol>
              </li>
            </ol>
          </li>
        </ol>
      </section>
    </div>
  );
};

export default Rules;
