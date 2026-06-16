export class EvidenceAliasRegistry {
  private readonly aliasByRealId = new Map<string, string>();
  private readonly realIdByAlias = new Map<string, string>();

  register(realEvidenceId: string): string {
    const existing = this.aliasByRealId.get(realEvidenceId);
    if (existing) return existing;

    const alias = `e${this.aliasByRealId.size + 1}`;
    this.aliasByRealId.set(realEvidenceId, alias);
    this.realIdByAlias.set(alias, realEvidenceId);
    return alias;
  }

  toRealId(alias: string): string | undefined {
    const normalized = alias.trim().replace(/^\[([^\]]+)\]$/, "$1");
    return this.realIdByAlias.get(normalized);
  }
}
