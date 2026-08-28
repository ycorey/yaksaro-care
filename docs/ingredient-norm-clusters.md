# 성분명 정규화 병합 클러스터 — 약사 검수

> 생성: `node scripts/report-ingredient-clusters.mjs` · 데이터 기준일 2026-08-28
> 정규화 규칙: `src/lib/ingredient-key.ts` (rule_version v1)

## 왜 검수가 필요한가

`ingredientKey()` 는 염·수화물 접미를 반복 제거해 서로 다른 표기를 한 키로 접는다.
병합이 **옳으면** 규칙 하나가 모든 제형에 닿고(예: Atorvastatin Calcium / …Hydrate / …Trihydrate),
**틀리면** 서로 다른 약이 같은 키가 돼 거짓 경고가 된다(예: Potassium Chloride → potassium).

무기물 양이온 거부 규칙이 후자를 막지만, 남은 병합이 전부 안전한지는 사람이 판단해야 한다.
아래 각 클러스터에 `merge`(병합 유지) 또는 `keep`(분리 필요) 를 적어 주세요.
`keep` 이 필요한 항목은 `ingredient-key.ts` 의 거부 목록이나 `ingredient_norms` 수동 매핑으로 처리한다.

- 고유 성분명: **4,370종**
- 병합이 일어나는 클러스터: **178개** (이름 408개, 9.3%)
- 나머지 3,962종은 1:1 이라 검수 대상이 아니다

## 클러스터 (영향 약 수 내림차순)

| 판정 | norm_key | 약 수 | 병합되는 이름 |
|---|---|---|---|
|  | `amlodipine` | 1,395 | `Amlodipine Besylate` · `Amlodipine Maleate` · `Amlodipine Mesylate Monohydrate` |
|  | `riboflavin` | 904 | `Riboflavin` · `Riboflavin Sodium Phosphate` · `Riboflavin Sodium Phosphate Dihydrate` |
|  | `sitagliptin` | 807 | `Sitagliptin Hydrochloride Hydrate` · `Sitagliptin Phosphate` · `Sitagliptin Phosphate Hydrate` |
|  | `atorvastatin` | 789 | `Atorvastatin` · `Atorvastatin Calcium` · `Atorvastatin Calcium Hydrate` · `Atorvastatin Calcium Trihydrate` |
|  | `thiamine` | 632 | `Thiamine Chloride Hydrochloride` · `Thiamine Hydrochloride` · `Thiamine Nitrate` |
|  | `tocopherol` | 566 | `Tocopherol` · `Tocopherol Acetate` · `Tocopherol Calcium Succinate` |
|  | `amoxicillin` | 460 | `Amoxicillin` · `Amoxicillin Hydrate` · `Amoxicillin Sodium` |
|  | `pseudoephedrine` | 422 | `Pseudoephedrine Hydrochloride` · `Pseudoephedrine Sulfate` |
|  | `dl-methylephedrine` | 421 | `DL-Methylephedrine Hydrochloride` · `DL-Methylephedrine Maleate` |
|  | `donepezil` | 390 | `Donepezil` · `Donepezil Hydrochloride` · `Donepezil Hydrochloride Hydrate` · `Donepezil Hydrochloride Monohydrate` |
|  | `dextromethorphan hydrobromide` | 375 | `Dextromethorphan Hydrobromide` · `Dextromethorphan Hydrobromide Hydrate` |
|  | `esomeprazole` | 307 | `Esomeprazole` · `Esomeprazole Magnesium Dihydrate` · `Esomeprazole Magnesium Trihydrate` · `Esomeprazole Sodium` |
|  | `fursultiamine` | 277 | `Fursultiamine` · `Fursultiamine Hydrochloride` |
|  | `lidocaine` | 267 | `Lidocaine` · `Lidocaine Hydrochloride` · `Lidocaine Hydrochloride Hydrate` · `Lidocaine Hydrochloride Monohydrate` |
|  | `levofloxacin` | 256 | `Levofloxacin` · `Levofloxacin Hydrate` |
|  | `ibuprofen` | 254 | `Ibuprofen` · `Ibuprofen Sodium Dihydrate` |
|  | `linagliptin` | 241 | `Linagliptin` · `Linagliptin Besylate` |
|  | `l-arginine` | 213 | `L-Arginine` · `L-Arginine Hydrochloride` |
|  | `oseltamivir` | 196 | `Oseltamivir` · `Oseltamivir Phosphate` |
|  | `l-lysine` | 195 | `L-Lysine Acetate` · `L-Lysine Hydrochloride` · `L-Lysine Monohydrate` |
|  | `mosapride` | 188 | `Mosapride Citrate` · `Mosapride Citrate Dihydrate` |
|  | `cefaclor` | 184 | `Cefaclor` · `Cefaclor Hydrate` |
|  | `terbinafine` | 177 | `Terbinafine` · `Terbinafine Hydrochloride` |
|  | `diphenhydramine` | 175 | `Diphenhydramine` · `Diphenhydramine Citrate` · `Diphenhydramine Hydrochloride` |
|  | `glucose` | 173 | `Glucose` · `Glucose Hydrate` · `Glucose Monohydrate` |
|  | `l-histidine` | 171 | `L-Histidine` · `L-Histidine Hydrochloride` · `L-Histidine Hydrochloride Hydrate` · `L-Histidine Hydrochloride Monohydrate` |
|  | `manganese sulfate` | 167 | `Manganese Sulfate` · `Manganese Sulfate Hydrate` |
|  | `pitavastatin` | 166 | `Pitavastatin Calcium` · `Pitavastatin Calcium Hydrate` |
|  | `solifenacin` | 161 | `Solifenacin Fumarate` · `Solifenacin Succinate` · `Solifenacin Tartrate` |
|  | `loxoprofen` | 152 | `Loxoprofen Sodium` · `Loxoprofen Sodium Hydrate` |
|  | `trimebutine` | 147 | `Trimebutine` · `Trimebutine Maleate` |
|  | `ceftriaxone` | 145 | `Ceftriaxone Sodium` · `Ceftriaxone Sodium Hydrate` |
|  | `ciprofloxacin` | 138 | `Ciprofloxacin` · `Ciprofloxacin Hydrochloride` · `Ciprofloxacin Hydrochloride Hydrate` |
|  | `calcium chloride` | 129 | `Calcium Chloride` · `Calcium Chloride Hydrate` |
|  | `sucralfate` | 128 | `Sucralfate` · `Sucralfate Hydrate` |
|  | `hydrocortisone` | 128 | `Hydrocortisone` · `Hydrocortisone Acetate` · `Hydrocortisone Sodium Succinate` · `Hydrocortisone Succinate` |
|  | `sildenafil` | 114 | `Sildenafil` · `Sildenafil Citrate` |
|  | `bepotastine` | 111 | `Bepotastine Besylate` · `Bepotastine Calcium Dihydrate` |
|  | `zinc sulfate` | 111 | `Zinc Sulfate` · `Zinc Sulfate Hydrate` |
|  | `diclofenac` | 111 | `Diclofenac` · `Diclofenac Potassium` · `Diclofenac Sodium` |
|  | `lysozyme` | 110 | `Lysozyme Chloride` · `Lysozyme Hydrochloride` |
|  | `calcium citrate` | 110 | `Calcium Citrate` · `Calcium Citrate Hydrate` · `Calcium Citrate Maleate` |
|  | `mometasone furoate` | 107 | `Mometasone Furoate` · `Mometasone Furoate Monohydrate` |
|  | `methylprednisolone` | 104 | `Methylprednisolone` · `Methylprednisolone Acetate` · `Methylprednisolone Sodium Succinate` |
|  | `naproxen` | 102 | `Naproxen` · `Naproxen Sodium` |
|  | `pancreatin` | 100 | `Pancreatin` · `Pancreatin I` |
|  | `entecavir` | 97 | `Entecavir` · `Entecavir Hydrate` · `Entecavir Monohydrate` |
|  | `anhydrous dibasic` | 91 | `Anhydrous Dibasic Calcium Phosphate` · `Anhydrous Dibasic Sodium Phosphate` |
|  | `l-cysteine` | 89 | `L-Cysteine` · `L-Cysteine Hydrochloride` · `L-Cysteine Hydrochloride Hydrate` |
|  | `fentanyl` | 79 | `Fentanyl` · `Fentanyl Citrate` |
|  | `cimetidine` | 79 | `Cimetidine` · `Cimetidine Hydrochloride` |
|  | `fluorometholone` | 77 | `Fluorometholone` · `Fluorometholone Acetate` |
|  | `tobramycin` | 77 | `Tobramycin` · `Tobramycin Sulfate` |
|  | `triprolidine` | 76 | `Triprolidine Hydrochloride` · `Triprolidine Hydrochloride Hydrate` |
|  | `l-ornithine-l-aspartate` | 75 | `L-Ornithine-L-Aspartate` · `L-Ornithine-L-Aspartate Hydrate` |
|  | `magnesium chloride` | 71 | `Magnesium Chloride` · `Magnesium Chloride Hydrate` |
|  | `sodium acetate` | 71 | `Sodium Acetate` · `Sodium Acetate Hydrate` |
|  | `noscapine` | 70 | `Noscapine` · `Noscapine Hydrochloride` · `Noscapine Hydrochloride Hydrate` |
|  | `piroxicam` | 67 | `Piroxicam` · `Piroxicam Potassium` |
|  | `sodium alendronate` | 67 | `Sodium Alendronate` · `Sodium Alendronate Hydrate` · `Sodium Alendronate Trihydrate` |
|  | `rasagiline` | 64 | `Rasagiline Mesylate` · `Rasagiline Tartrate` |
|  | `lipase` | 63 | `Lipase` · `Lipase II` |
|  | `flurbiprofen` | 63 | `Flurbiprofen` · `Flurbiprofen Sodium` |
|  | `s-amlodipine` | 62 | `S-Amlodipine Besylate` · `S-Amlodipine Besylate Dihydrate` |
|  | `cellulase` | 60 | `Cellulase` · `Cellulase II` |
|  | `citicoline` | 59 | `Citicoline` · `Citicoline Sodium` |
|  | `cupric` | 59 | `Cupric Chloride Hydrate` · `Cupric Sulfate Hydrate` |
|  | `dibasic` | 59 | `Dibasic Calcium Phosphate Hydrate` · `Dibasic Potassium Phosphate` · `Dibasic Sodium Phosphate Dihydrate` · `Dibasic Sodium Phosphate Hydrate` |
|  | `cefixime` | 58 | `Cefixime` · `Cefixime Hydrate` |
|  | `betaine` | 56 | `Betaine` · `Betaine Hydrochloride` |
|  | `domperidone` | 54 | `Domperidone` · `Domperidone Maleate` |
|  | `clindamycin` | 53 | `Clindamycin Hydrochloride` · `Clindamycin Phosphate` |
|  | `anhydrous` | 53 | `Anhydrous Magnesium Sulfate` · `Anhydrous Sodium Sulfate` |
|  | `caffeine` | 52 | `Caffeine` · `Caffeine Hydrate` |
|  | `terazosin` | 50 | `Terazosin Hydrochloride` · `Terazosin Hydrochloride Dihydrate` · `Terazosin Hydrochloride Hydrate` |
|  | `hydroxocobalamin` | 47 | `Hydroxocobalamin` · `Hydroxocobalamin Acetate` |
|  | `dobesilate` | 45 | `Dobesilate Calcium` · `Dobesilate Calcium Hydrate` |
|  | `tofacitinib` | 45 | `Tofacitinib` · `Tofacitinib Citrate` |
|  | `vildagliptin` | 44 | `Vildagliptin` · `Vildagliptin Hydrochloride` · `Vildagliptin Nitrate` |
|  | `cefadroxil` | 43 | `Cefadroxil` · `Cefadroxil Hydrate` · `Cefadroxil Monohydrate` |
|  | `moxifloxacin` | 43 | `Moxifloxacin` · `Moxifloxacin Hydrochloride` |
|  | `tenofovir disoproxil` | 41 | `Tenofovir Disoproxil` · `Tenofovir Disoproxil Fumarate` · `Tenofovir Disoproxil Phosphate` |
|  | `l-arginine-l-aspartate` | 41 | `L-Arginine-L-Aspartate` · `L-Arginine-L-Aspartate Hydrate` |
|  | `aripiprazole` | 41 | `Aripiprazole` · `Aripiprazole Monohydrate` |
|  | `dibucaine` | 41 | `Dibucaine` · `Dibucaine Hydrochloride` |
|  | `potassium guaiacolsulfonate` | 40 | `Potassium Guaiacolsulfonate` · `Potassium Guaiacolsulfonate Hydrate` |
|  | `risedronate` | 40 | `Risedronate Sodium` · `Risedronate Sodium Monohydrate` |
|  | `cefradine` | 39 | `Cefradine` · `Cefradine Hydrate` |
|  | `prednisolone` | 38 | `Prednisolone` · `Prednisolone Acetate` |
|  | `dexamethasone` | 35 | `Dexamethasone` · `Dexamethasone Sodium Phosphate` |
|  | `raloxifene` | 34 | `Raloxifene Hydrochloride` · `Raloxifene Hydrochloride Monohydrate` |
|  | `cetylpyridinium` | 32 | `Cetylpyridinium Chloride` · `Cetylpyridinium Chloride Hydrate` |
|  | `glycyrrhiza soft extract (2.4~2.9-1)` | 32 | `Glycyrrhiza Soft Extract (2.4~2.9→1)` · `Glycyrrhiza Soft Extract (2.4∼2.9→1)` |
|  | `mirabegron` | 31 | `Mirabegron` · `Mirabegron Hydrate` |
|  | `ampicillin` | 31 | `Ampicillin` · `Ampicillin Hydrate` · `Ampicillin Sodium` |
|  | `epinephrine` | 29 | `Epinephrine` · `Epinephrine Tartrate` |
|  | `morphine` | 27 | `Morphine Hydrochloride` · `Morphine Hydrochloride Hydrate` · `Morphine Sulfate` · `Morphine Sulfate Hydrate` |
|  | `chlorhexidine` | 26 | `Chlorhexidine Acetate` · `Chlorhexidine Hydrochloride` |
|  | `paroxetine` | 26 | `Paroxetine Hydrochloride Hemihydrate` · `Paroxetine Hydrochloride Hydrate` |
|  | `lenalidomide` | 26 | `Lenalidomide` · `Lenalidomide Hemihydrate` · `Lenalidomide Hydrate` |
|  | `azithromycin` | 25 | `Azithromycin` · `Azithromycin Hydrate` |
|  | `monobasic` | 24 | `Monobasic Potassium Phosphate` · `Monobasic Sodium Phosphate` · `Monobasic Sodium Phosphate Dihydrate` · `Monobasic Sodium Phosphate Hydrate` · `Monobasic Sodium Phosphate Monohydrate` |
|  | `betamethasone` | 23 | `Betamethasone` · `Betamethasone Sodium Phosphate` |
|  | `chlorophyllin copper` | 22 | `Chlorophyllin Copper` · `Chlorophyllin Copper Sodium` |
|  | `mupirocin` | 21 | `Mupirocin` · `Mupirocin Calcium` · `Mupirocin Calcium Hydrate` |
|  | `calcipotriol` | 20 | `Calcipotriol` · `Calcipotriol Hydrate` · `Calcipotriol Monohydrate` |
|  | `valaciclovir` | 20 | `Valaciclovir Hydrochloride` · `Valaciclovir Hydrochloride Hydrate` |
|  | `phloroglucinol` | 19 | `Phloroglucinol` · `Phloroglucinol Hydrate` |
|  | `ceftazidime` | 18 | `Ceftazidime` · `Ceftazidime Hydrate` |
|  | `ondansetron` | 18 | `Ondansetron` · `Ondansetron Hydrochloride` · `Ondansetron Hydrochloride Hydrate` |
|  | `nicotine` | 17 | `Nicotine` · `Nicotine Tartrate Hydrate` |
|  | `piperacillin` | 17 | `Piperacillin Hydrate` · `Piperacillin Sodium` |
|  | `platycodon root soft extract (2.3~2.8-1)` | 17 | `Platycodon Root Soft Extract (2.3~2.8→1)` · `Platycodon Root Soft Extract (2.3∼2.8→1)` |
|  | `naloxone` | 17 | `Naloxone Hydrochloride` · `Naloxone Hydrochloride Dihydrate` |
|  | `aluminium chloride` | 16 | `Aluminium Chloride` · `Aluminium Chloride Hydrate` |
|  | `purified influenza virus antigen(split virion` | 16 | `Purified influenza virus antigen(Split virion` · `Purified influenza virus antigen(split virion` |
|  | `formoterol` | 16 | `Formoterol Fumarate` · `Formoterol Fumarate Dihydrate` · `Formoterol Fumarate Hydrate` |
|  | `betahistine` | 16 | `Betahistine Hydrochloride` · `Betahistine Mesylate` |
|  | `adenosine disodium triphosphate` | 15 | `Adenosine Disodium Triphosphate` · `Adenosine Disodium Triphosphate Trihydrate` |
|  | `sodium glycerophosphate` | 15 | `Sodium Glycerophosphate` · `Sodium Glycerophosphate Hydrate` |
|  | `lincomycin` | 15 | `Lincomycin Hydrochloride` · `Lincomycin Hydrochloride Hydrate` |
|  | `potassium citrate` | 15 | `Potassium Citrate` · `Potassium Citrate Hydrate` |
|  | `arginine` | 15 | `Arginine` · `Arginine Hydrochloride` |
|  | `doxycycline` | 15 | `Doxycycline` · `Doxycycline Hydrate` |
|  | `magnesium lactate` | 15 | `Magnesium Lactate` · `Magnesium Lactate Hydrate` |
|  | `imipenem` | 14 | `Imipenem` · `Imipenem Hydrate` |
|  | `cefdinir` | 14 | `Cefdinir` · `Cefdinir Monohydrate` |
|  | `atropine` | 14 | `Atropine` · `Atropine Sulfate` · `Atropine Sulfate Hydrate` |
|  | `dabigatran etexilate` | 14 | `Dabigatran Etexilate` · `Dabigatran Etexilate Mesylate` |
|  | `cefalexin` | 13 | `Cefalexin` · `Cefalexin Hydrate` · `Cefalexin Sodium Hydrate` |
|  | `ginseng soft extract (2.2~2.7-1)` | 13 | `Ginseng Soft Extract (2.2~2.7→1)` · `Ginseng Soft Extract (2.2∼2.7→1)` |
|  | `orphenadrine` | 13 | `Orphenadrine Citrate` · `Orphenadrine Hydrochloride` |
|  | `ropivacaine` | 11 | `Ropivacaine Hydrochloride` · `Ropivacaine Hydrochloride Hydrate` |
|  | `nintedanib esylate` | 11 | `Nintedanib Esylate` · `Nintedanib Esylate Hemihydrate` |
|  | `biodiastase 2000` | 10 | `Biodiastase 2000` · `Biodiastase 2000 I` · `Biodiastase 2000 II` · `Biodiastase 2000 IV` |
|  | `doxycycline hyclate` | 10 | `Doxycycline Hyclate` · `Doxycycline Hyclate Hydrate` |
|  | `sodium molybdate` | 10 | `Sodium Molybdate` · `Sodium Molybdate Hydrate` |
|  | `lysine` | 10 | `Lysine Acetate` · `Lysine Hydrochloride` |
|  | `ferrous gluconate` | 10 | `Ferrous Gluconate` · `Ferrous Gluconate Hydrate` |
|  | `magnesium citrate` | 9 | `Magnesium Citrate` · `Magnesium Citrate Hydrate` |
|  | `cefepime` | 9 | `Cefepime Hydrochloride` · `Cefepime Hydrochloride Hydrate` |
|  | `d-alpha-tocopherol` | 9 | `D-Alpha-Tocopherol Acetate` · `D-Alpha-Tocopherol Succinate` |
|  | `aminophylline` | 9 | `Aminophylline` · `Aminophylline Hydrate` |
|  | `desvenlafaxine` | 9 | `Desvenlafaxine` · `Desvenlafaxine Succinate Monohydrate` |
|  | `minocycline` | 9 | `Minocycline Hydrochloride` · `Minocycline Hydrochloride Hydrate` |
|  | `granisetron` | 9 | `Granisetron` · `Granisetron Hydrochloride` |
|  | `cefotetan` | 8 | `Cefotetan` · `Cefotetan Sodium` |
|  | `cyproheptadine orotate` | 8 | `Cyproheptadine Orotate` · `Cyproheptadine Orotate Hydrate` |
|  | `indacaterol` | 8 | `Indacaterol Acetate` · `Indacaterol Maleate` |
|  | `metoclopramide` | 8 | `Metoclopramide` · `Metoclopramide Hydrochloride Hydrate` |
|  | `phenobarbital` | 8 | `Phenobarbital` · `Phenobarbital Sodium` |
|  | `phenytoin` | 8 | `Phenytoin` · `Phenytoin Sodium` |
|  | `docetaxel` | 7 | `Docetaxel Hydrate` · `Docetaxel Trihydrate` |
|  | `sennoside` | 7 | `Sennoside` · `Sennoside Calcium` |
|  | `agastachis herba soft extract (3.0~3.7-1)` | 7 | `Agastachis Herba Soft Extract (3.0~3.7→1)` · `Agastachis Herba Soft Extract (3.0∼3.7→1)` |
|  | `aurantii fructus immaturus soft extract (1.4~1.7-1)` | 7 | `Aurantii Fructus Immaturus Soft Extract (1.4~1.7→1)` · `Aurantii Fructus Immaturus Soft Extract (1.4∼1.7→1)` |
|  | `metoprolol` | 4 | `Metoprolol Succinate` · `Metoprolol Tartrate` |
|  | `mirodenafil` | 4 | `Mirodenafil` · `Mirodenafil Hydrochloride` |
|  | `cefroxadine` | 4 | `Cefroxadine` · `Cefroxadine Hydrate` |
|  | `varenicline` | 4 | `Varenicline Fumarate` · `Varenicline Tartrate` |
|  | `jujube soft extract (1.2~1.5-1)` | 4 | `Jujube Soft Extract (1.2~1.5→1)` · `Jujube Soft Extract (1.2∼1.5→1)` |
|  | `fusidic acid` | 4 | `Fusidic Acid` · `Fusidic Acid Hydrate` |
|  | `bendamustine` | 4 | `Bendamustine Hydrochloride` · `Bendamustine Hydrochloride Monohydrate` |
|  | `oxybutynin` | 4 | `Oxybutynin` · `Oxybutynin Hydrochloride` |
|  | `chlordiazepoxide` | 3 | `Chlordiazepoxide` · `Chlordiazepoxide Hydrochloride` |
|  | `argatroban` | 3 | `Argatroban` · `Argatroban Hydrate` |
|  | `melphalan` | 3 | `Melphalan` · `Melphalan Hydrochloride` |
|  | `lactitol` | 3 | `Lactitol Hydrate` · `Lactitol Monohydrate` |
|  | `tazobactam` | 3 | `Tazobactam` · `Tazobactam Sodium` |
|  | `cefbuperazone` | 3 | `Cefbuperazone Hydrate` · `Cefbuperazone Sodium` |
|  | `cellulase ap3` | 3 | `Cellulase AP3` · `Cellulase AP3 III` |
|  | `fluorescein` | 3 | `Fluorescein` · `Fluorescein Sodium` |
|  | `tenofovir alafenamide` | 3 | `Tenofovir Alafenamide` · `Tenofovir Alafenamide Citrate` · `Tenofovir Alafenamide Succinate` |
|  | `acalabrutinib` | 2 | `Acalabrutinib` · `Acalabrutinib Maleate Monohydrate` |
|  | `mercaptopurine` | 2 | `Mercaptopurine` · `Mercaptopurine Hydrate` |
|  | `doripenem` | 2 | `Doripenem` · `Doripenem Monohydrate` |
|  | `regorafenib` | 2 | `Regorafenib` · `Regorafenib Monohydrate` |
|  | `perphenazine` | 2 | `Perphenazine` · `Perphenazine Hydrochloride` |

## 검수 결과

(판정 열을 채운 뒤 이 절에 요약을 적어 주세요 — `keep` 으로 판정된 클러스터와 그 처리 방법)

