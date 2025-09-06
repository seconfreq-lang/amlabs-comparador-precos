const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');
const XLSX = require('xlsx');
const stringSimilarity = require('string-similarity');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração do multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Funções utilitárias
const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');

const normEAN = (s) => {
  const d = onlyDigits(s);
  if (!d || d.length === 0) return null;
  // Rejeitar se for composto APENAS de zeros
  if (/^0+$/.test(d)) return null;
  
  // Aceitar comprimentos válidos: 8, 11, 12, 13, 14
  // Para EANs de 11 dígitos, adicionar zeros à esquerda para formar 13 dígitos
  if (d.length === 11) {
    return '00' + d;
  }
  
  // Aceitar outros comprimentos válidos
  if ([8, 12, 13, 14].includes(d.length)) {
    return d;
  }
  
  return null;
};



// Função para detectar multiplicador em descrição
const detectMultiplicador = (descricao) => {
  if (!descricao) return 1;
  
  const patterns = [
    /CX(\d+)/i,
    /C\/(\d+)/i,
    /(\d+)\s*UN(D|I)?\b/i,
    /(\d+)\s*x/i,
    /FARDO\s*(\d+)/i,
    /KIT\s*(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = descricao.match(pattern);
    if (match) {
      return parseInt(match[1]) || 1;
    }
  }
  
  return 1;
};

// Função para normalizar nome para fuzzy matching
const normalizarNome = (nome) => {
  if (!nome) return '';
  
  return nome
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/\b(LT|LATA|PET|CP|FI|FL|CX|PACK|FARDO|KIT)\b/g, '') // Remove tokens de ruído
    .replace(/C\/\d+/g, '') // Remove C/número
    .replace(/\d+UN/g, '') // Remove número+UN
    .replace(/\d+x/g, '') // Remove número+x
    .replace(/\s+/g, ' ') // Normaliza espaços
    .trim();
};

// Função para extrair tokens de capacidade
const extrairCapacidade = (nome) => {
  if (!nome) return [];
  
  const matches = nome.match(/(\d+(?:\.\d+)?)(ML|L|G|KG|MG)\b/gi);
  return matches ? matches.map(m => m.toUpperCase()) : [];
};

// Função para fuzzy matching
const fuzzyMatch = (nomeXML, linhasExcel, threshold = 0.80) => {
  const nomeNormalizado = normalizarNome(nomeXML);
  const capacidadeXML = extrairCapacidade(nomeXML);
  
  let melhorMatch = null;
  let melhorScore = 0;
  
  for (const linha of linhasExcel) {
    if (!linha.nomeExcel) continue;
    
    const nomeExcelNorm = normalizarNome(linha.nomeExcel);
    const capacidadeExcel = extrairCapacidade(linha.nomeExcel);
    
    // Verifica overlap de capacidade se ambos tiverem
    if (capacidadeXML.length > 0 && capacidadeExcel.length > 0) {
      const hasOverlap = capacidadeXML.some(cap => capacidadeExcel.includes(cap));
      if (!hasOverlap) continue;
    }
    
    const similarity = stringSimilarity.compareTwoStrings(nomeNormalizado, nomeExcelNorm);
    
    if (similarity >= threshold && similarity > melhorScore) {
      melhorScore = similarity;
      melhorMatch = linha;
    }
  }
  
  return melhorMatch;
};

// Endpoint principal
app.post('/api/comparar', upload.fields([{ name: 'xml' }, { name: 'xlsx' }]), async (req, res) => {
  try {
    if (!req.files || !req.files.xml || !req.files.xlsx) {
      return res.status(400).json({ error: 'Arquivos XML e XLSX são obrigatórios' });
    }
    
    const xmlBuffer = req.files.xml[0].buffer;
    const xlsxBuffer = req.files.xlsx[0].buffer;
    
    // Parse do XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: 'text'
    });
    
    const xmlData = parser.parse(xmlBuffer.toString());
    
    // Navegar pela estrutura da NFe
    let produtos = [];
    const nfe = xmlData.nfeProc?.NFe || xmlData.NFe;
    
    if (!nfe) {
      return res.status(400).json({ error: 'Estrutura XML inválida - NFe não encontrada' });
    }
    
    const infNFe = nfe.infNFe;
    const detalhes = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];
    
    for (const det of detalhes) {
      const prod = det.prod;
      if (!prod) continue;
      
      const ean = normEAN(prod.cEAN);
      const eanTrib = normEAN(prod.cEANTrib);
      
      // Calcular preço unitário
      let precoXML_unit = 0;
      
      if (prod.vUnTrib && parseFloat(prod.vUnTrib) > 0) {
        precoXML_unit = parseFloat(prod.vUnTrib);
      } else {
        const multiplicador = detectMultiplicador(prod.xProd);
        if (prod.vUnCom && parseFloat(prod.vUnCom) > 0) {
          precoXML_unit = parseFloat(prod.vUnCom) / multiplicador;
        } else if (prod.vProd && prod.qCom) {
          precoXML_unit = parseFloat(prod.vProd) / (parseFloat(prod.qCom) * multiplicador);
        }
      }
      
      produtos.push({
        codigo: prod.cProd || '',
        descricao: prod.xProd || '',
        uCom: prod.uCom || '',
        qCom: parseFloat(prod.qCom) || 0,
        uTrib: prod.uTrib || '',
        qTrib: parseFloat(prod.qTrib) || 0,
        precoXML_unit: Math.round(precoXML_unit * 10000) / 10000,
        ean,
        eanTrib
      });
    }
    
    // Parse do Excel
    const workbook = XLSX.read(xlsxBuffer, { raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const excelData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
    
    // Mapear colunas do Excel
    const mapByEan = {};
    const mapByCode = {};
    const linhasExcel = [];
    
    for (const row of excelData) {
      const precoTabela = parseFloat(row['Preço']) || 0;
      const eanExcel = onlyDigits(row['Código de barras']);
      const codigoExcel = String(row['Código Produto'] || '').trim();
      const nomeExcel = String(row['Descrição Produto'] || '').trim();
      
      if (eanExcel) {
        mapByEan[eanExcel] = precoTabela;
      }
      
      if (codigoExcel) {
        mapByCode[codigoExcel] = precoTabela;
      }
      
      linhasExcel.push({
        precoTabela,
        eanExcel,
        codigoExcel,
        nomeExcel
      });
    }
    
    // Matching e resultado
    const resultado = [];
    
    for (const produto of produtos) {
      let precoTabela = 0;
      let eanExcel = '';
      let matchType = 'NULL';
      let observacoes = '';
      
      // 1º: Tentar EAN comercial
      if (produto.ean && mapByEan[produto.ean]) {
        precoTabela = mapByEan[produto.ean];
        eanExcel = produto.ean;
        matchType = 'EAN-Com';
      }
      // 2º: Tentar EAN tributável
      else if (produto.eanTrib && mapByEan[produto.eanTrib]) {
        precoTabela = mapByEan[produto.eanTrib];
        eanExcel = produto.eanTrib;
        matchType = 'EAN-Trib';
      }
      // 3º: Tentar por código
      else if (produto.codigo && mapByCode[produto.codigo]) {
        precoTabela = mapByCode[produto.codigo];
        matchType = 'CODIGO';
      }
      // 4º: Fuzzy matching
      else {
        const fuzzyResult = fuzzyMatch(produto.descricao, linhasExcel);
        if (fuzzyResult) {
          precoTabela = fuzzyResult.precoTabela;
          eanExcel = fuzzyResult.eanExcel;
          matchType = 'FUZZY';
        } else {
          // Definir observações específicas
          if (!produto.ean && !produto.eanTrib) {
            observacoes = 'EAN XML vazio/SEM GTIN';
          } else {
            observacoes = 'cEAN sem match; cEANTrib sem match';
          }
        }
      }
      
      // Calcular preço mínimo e status
      const precoMinimo = Math.round(produto.precoXML_unit * 1.5 * 10000) / 10000;
      let status = 'SEM_PRECO';
      
      if (produto.precoXML_unit <= 0) {
        status = 'ERRO_PARSING';
      } else if (precoTabela > 0) {
        status = precoTabela >= precoMinimo ? 'OK' : 'ABAIXO_MINIMO';
      }
      
      resultado.push({
        codigo: produto.codigo,
        descricao: produto.descricao,
        quantidadeXml: produto.qCom,
        unidade: produto.uCom || produto.uTrib || '',
        ean: produto.ean || '',
        eanTrib: produto.eanTrib || '',
        eanExcel: eanExcel,
        precoXML_unit: produto.precoXML_unit,
        precoTabela: precoTabela,
        precoMinimo: precoMinimo,
        status: status,
        matchType: matchType,
        observacoes: observacoes
      });
    }
    
    res.json(resultado);
    
  } catch (error) {
    console.error('Erro no processamento:', error);
    res.status(500).json({ error: 'Erro interno do servidor: ' + error.message });
  }
});

// Servir arquivos estáticos
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
});

module.exports = app;