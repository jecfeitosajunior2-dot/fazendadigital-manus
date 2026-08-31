/**
 * EditAnimalPage — re-exporta o AnimalFormPage unificado.
 *
 * O AnimalFormPage (NewAnimalPage.tsx) detecta automaticamente o modo de edição
 * pelo parâmetro ?id= na URL. Histórico de identificação consulta-se na ficha
 * (Detalhes do Animal → Identificação). Trocas operacionais: Manejo → Identificação.
 */
export { EditAnimalPage } from "./NewAnimalPage";
