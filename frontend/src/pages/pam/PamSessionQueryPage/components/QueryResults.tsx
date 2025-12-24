import { useMemo } from "react";

import { EmptyState, Table, TableContainer, TBody, Td, Th, THead, Tr } from "@app/components/v2";

interface QueryResultsProps {
  data: {
    rows: any[];
    rowCount: number;
    fields: Array<{ name: string; dataTypeID: number }>;
    executionTime: number;
  } | null;
  error: {
    message: string;
    code?: string;
  } | null;
}

export const QueryResults = ({ data, error }: QueryResultsProps) => {
  const columns = useMemo(() => {
    if (!data?.fields) return [];
    return data.fields.map((field) => field.name);
  }, [data?.fields]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
        <div className="mb-1 text-sm font-semibold text-red-400">Query Error</div>
        <div className="text-sm text-red-300">{error.message}</div>
        {error.code && <div className="mt-1 text-xs text-red-400">Code: {error.code}</div>}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8">
        <EmptyState title="No results">
          <span className="text-xs text-mineshaft-400">Execute a query to see results here</span>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800">
      <div className="border-b border-mineshaft-600 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-mineshaft-300">
            {data.rowCount} {data.rowCount === 1 ? "row" : "rows"} returned
          </div>
          <div className="text-xs text-mineshaft-400">Executed in {data.executionTime}ms</div>
        </div>
      </div>
      <div className="max-h-96 overflow-auto">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                {columns.map((column) => (
                  <Th key={column}>{column}</Th>
                ))}
              </Tr>
            </THead>
            <TBody>
              {data.rows.map((row) => (
                <Tr key={JSON.stringify(row)}>
                  {columns.map((column) => (
                    <Td key={`${JSON.stringify(row)}-${column}`}>
                      {row[column] === null ? (
                        <span className="text-mineshaft-400 italic">NULL</span>
                      ) : (
                        String(row[column])
                      )}
                    </Td>
                  ))}
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
};
