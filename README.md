# AmLabs - Comparador de Preços XML vs Excel

Sistema de comparação de preços entre arquivos XML (NFe) e planilhas Excel, desenvolvido para análise de conformidade de preços com base em tabelas de referência.

## 🚀 Funcionalidades

- **Upload de Arquivos**: Suporte para XML (NFe) e Excel (.xlsx)
- **Parsing Inteligente**: Extração automática de dados de produtos da NFe
- **Matching Avançado**: Comparação por EAN, código de produto e fuzzy matching
- **Cálculo de Preços**: Detecção automática de multiplicadores (CX, FARDO, KIT, etc.)
- **Filtros e Busca**: Filtros por status, tipo de match e busca por código/descrição
- **Contadores**: Estatísticas em tempo real por status e tipo de match
- **Exportação**: Geração de CSV com dados filtrados
- **Diagnóstico**: Painel com informações detalhadas do processamento

## 📋 Pré-requisitos

- Node.js 18+ 
- NPM ou Yarn

## 🛠️ Instalação e Execução Local

1. **Clone ou baixe o projeto**
   ```bash
   cd amlabs-comparador-precos
   ```

2. **Instale as dependências**
   ```bash
   npm install
   ```

3. **Execute o servidor de desenvolvimento**
   ```bash
   npm run dev
   ```

4. **Acesse a aplicação**
   ```
   http://localhost:3000
   ```

## 🌐 Deploy no Vercel

1. **Instale a CLI do Vercel**
   ```bash
   npm i -g vercel
   ```

2. **Faça o deploy**
   ```bash
   vercel
   ```

3. **Configure as variáveis (se necessário)**
   - O projeto já inclui o arquivo `vercel.json` configurado

## 📊 Estrutura dos Arquivos

### XML (NFe)
O sistema espera arquivos XML no formato padrão da NFe brasileira com a estrutura:
```xml
<nfeProc>
  <NFe>
    <infNFe>
      <det>
        <prod>
          <cProd>código</cProd>
          <xProd>descrição</xProd>
          <cEAN>ean_comercial</cEAN>
          <cEANTrib>ean_tributavel</cEANTrib>
          <uCom>unidade</uCom>
          <qCom>quantidade</qCom>
          <vUnCom>valor_unitario</vUnCom>
          <!-- outros campos -->
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>
```

### Excel (.xlsx)
A planilha deve conter as seguintes colunas (nomes exatos):
- **Preço**: Valor de referência do produto
- **Código de barras**: EAN/GTIN do produto
- **Descrição Produto**: Nome/descrição para fuzzy matching
- **Código Produto**: Código alternativo para matching

## 🔍 Algoritmo de Matching

O sistema utiliza a seguinte ordem de prioridade para encontrar correspondências:

1. **EAN Comercial** (cEAN) ↔ Código de barras Excel
2. **EAN Tributável** (cEANTrib) ↔ Código de barras Excel  
3. **Código do Produto** (cProd) ↔ Código Produto Excel
4. **Fuzzy Matching** por descrição (threshold 0.80)
   - Normalização de texto (remoção de acentos, tokens de ruído)
   - Verificação de overlap em capacidades (ML, L, G, etc.)
   - Algoritmo de similaridade de strings

## 📈 Status de Comparação

- **OK**: Preço da tabela ≥ preço mínimo (XML × 1.5)
- **ABAIXO_MINIMO**: Preço da tabela < preço mínimo
- **SEM_PRECO**: Produto não encontrado na planilha
- **ERRO_PARSING**: Erro ao calcular preço unitário do XML

## 🎯 Detecção de Multiplicadores

O sistema detecta automaticamente multiplicadores na descrição:
- `CX12`, `C/12` → 12 unidades
- `24UN`, `24UND` → 24 unidades  
- `6x`, `FARDO 6`, `KIT 6` → 6 unidades

## 🛡️ Tecnologias Utilizadas

- **Backend**: Node.js, Express
- **Upload**: Multer
- **XML**: fast-xml-parser
- **Excel**: xlsx
- **Fuzzy**: string-similarity
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)

## 📝 Exemplo de Uso

1. Faça upload de um arquivo XML (NFe)
2. Faça upload de uma planilha Excel com preços de referência
3. Clique em "Comparar Arquivos"
4. Analise os resultados na tabela com filtros
5. Exporte os dados filtrados em CSV

## 🐛 Solução de Problemas

### Erro "Colunas ausentes"
- Verifique se a planilha Excel contém as colunas exatas: "Preço", "Código de barras", "Descrição Produto", "Código Produto"

### Erro "Estrutura XML inválida"
- Confirme que o arquivo XML é uma NFe válida
- Verifique se contém a estrutura `nfeProc/NFe/infNFe/det/prod`

### Muitos produtos "SEM_PRECO"
- Verifique se os códigos EAN estão corretos em ambos os arquivos
- Confirme se os códigos de produto coincidem
- Analise o diagnóstico para identificar problemas específicos

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

## 👥 Suporte

Para dúvidas ou problemas, consulte o painel de diagnóstico da aplicação ou verifique os logs do servidor.