import { useCallback, useEffect, useRef } from "react";
import { Operator, OperatorV2 } from "types/operators/operator";
import operatorJson from "data/operators";
import useLocalStorage from "./useLocalStorage";
import Roster from "types/operators/roster";
import supabase from "supabase/supabaseClient";
import handlePostgrestError from "util/fns/handlePostgrestError";
import { repair } from "util/fns/convertLegacyOperator";

function useOperators() {
  const [operators, setOperators] = useLocalStorage<Roster>("v3_roster", {});
  const [legacyOperators] = useLocalStorage<Record<string, OperatorV2>>("operators", {});

  // change operator, push to db
  const onChange = useCallback(
    (op: Operator) => {
      setOperators(({ ..._roster }) => {
        // assign if owned, otherwise delete
        if (op.potential) {
          _roster[op.op_id] = op;
          supabase
            .from("operators")
            .upsert(op)
            .then(({ error }) => handlePostgrestError(error));
        } else {
          delete _roster[op.op_id];
          supabase
            .from("operators")
            .delete()
            .eq("op_id", op.op_id)
            .then(({ error }) => handlePostgrestError(error));
        }
        return _roster;
      });
    },
    [setOperators]
  );

  const hydrated = useRef(false);
  // fetch data from db
  useEffect(() => {
    let isCanceled = false;
    if (hydrated.current) return;

    const fetchData = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user_id = session?.user.id;

      if (!user_id) return;

      const { data: dbOperators, error } = await supabase.from("operators").select().match({ user_id });
      if (error) handlePostgrestError(error);

      let _roster: Roster = {};
      if (dbOperators?.length)
        dbOperators.forEach((op) => (op.op_id in operatorJson ? (_roster[op.op_id] = op as Operator) : null));
      else if (legacyOperators) _roster = repair(legacyOperators);

      hydrated.current = true;
      if (!isCanceled) setOperators(_roster);
    };

    fetchData();

    return () => {
      isCanceled = true;
    };
  }, [hydrated, legacyOperators, setOperators]);

  return [operators, onChange] as const;
}
export default useOperators;
