import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Roll the dice (E5).
 *
 * The picker itself is behind a dynamic import so that the shell — which
 * carries this hook on every page — holds only the click handler, not the
 * scan. It pulls in one season's matchups when it runs, and nothing until
 * then.
 */
export const useRandomMatchup = () => {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  // A second click while a season is still downloading would start a second
  // scan and navigate twice.
  const inFlight = useRef(false);

  const roll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);

    try {
      const { findRandomMatchup, matchupHref } = await import(
        "./findRandomMatchup"
      );
      const target = await findRandomMatchup();
      if (target) navigate(matchupHref(target));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [navigate]);

  return { roll, pending };
};
