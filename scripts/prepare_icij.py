"""Build a reproducible one-hop ICIJ subset; Python 3.11+, standard library only."""
import argparse
import csv
import hashlib
import io
import json
import logging
from pathlib import Path
import zipfile

# Representative capitals, not personal addresses or precise company locations.
PLACES = {
 'Vietnam':[21.0285,105.8542], 'Viet Nam':[21.0285,105.8542],
 'British Virgin Islands':[18.4286,-64.6185], 'Hong Kong':[22.3193,114.1694],
 'Singapore':[1.3521,103.8198], 'Samoa':[-13.8333,-171.75],
 'Seychelles':[-4.6191,55.4513], 'Panama':[8.9824,-79.5199],
 'Bahamas':[25.0443,-77.3504], 'The Bahamas':[25.0443,-77.3504],
 'Cayman Islands':[19.2866,-81.3744], 'Bermuda':[32.2948,-64.7814],
 'United Kingdom':[51.5074,-0.1278], 'United States':[38.9072,-77.0369],
 'China':[39.9042,116.4074], 'Taiwan':[25.033,121.5654],
 'Malaysia':[3.139,101.6869], 'Thailand':[13.7563,100.5018],
 'Australia':[-35.2809,149.13], 'New Zealand':[-41.2865,174.7762],
 'Switzerland':[46.948,7.4474], 'Luxembourg':[49.6116,6.1319],
 'Mauritius':[-20.1609,57.5012], 'Malta':[35.8992,14.5141],
 'Cyprus':[35.1856,33.3823], 'Isle of Man':[54.1523,-4.4861],
 'Jersey':[49.1868,-2.1066], 'Guernsey':[49.4554,-2.5369],
 'Gibraltar':[36.1408,-5.3536], 'Belize':[17.251,-88.759],
 'Cook Islands':[-21.2129,-159.7823], 'Saint Kitts and Nevis':[17.3026,-62.7177],
 'Netherlands':[52.3676,4.9041], 'Canada':[45.4215,-75.6972],
 'France':[48.8566,2.3522], 'Germany':[52.52,13.405], 'Japan':[35.6762,139.6503],
 'South Korea':[37.5665,126.978], 'Russia':[55.7558,37.6173],
 'United Arab Emirates':[24.4539,54.3773], 'Indonesia':[-6.2088,106.8456],
 'Philippines':[14.5995,120.9842], 'India':[28.6139,77.209],
}

def rows(archive: zipfile.ZipFile, filename: str):
    """Stream UTF-8 CSV rows from the source archive."""
    with archive.open(filename) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'))

def prepare(source: Path, output: Path, country: str) -> dict:
    """Select all country seeds and every direct edge, retaining unknown locations."""
    nodes = {}
    with zipfile.ZipFile(source) as archive:
        for kind in ['entities','officers','intermediaries','addresses','others']:
            for row in rows(archive, f'nodes-{kind}.csv'):
                node_id = row['node_id']
                jurisdiction = row.get('jurisdiction_description','')
                countries = row.get('countries','')
                place = jurisdiction if jurisdiction else countries
                # Multiple countries are deliberately not reduced to a guessed point.
                point = PLACES.get(place)
                nodes[node_id] = {'id':node_id,'name':row.get('name','') or row.get('address','') or node_id,
                    'type':kind,'countries':countries,'country_codes':row.get('country_codes',''),
                    'jurisdiction':jurisdiction,'source':row.get('sourceID',''),
                    'valid_until':row.get('valid_until',''),'address':row.get('address',''),
                    'lat':point[0] if point else None,'lon':point[1] if point else None,
                    'location_basis':f'Representative capital: {place}' if point else 'Unknown / ambiguous',
                    'url':f'https://offshoreleaks.icij.org/nodes/{node_id}'}
        seeds = {n['id'] for n in nodes.values() if country in n['country_codes'].split(';')}
        edges = []
        selected = set(seeds)
        for row in rows(archive,'relationships.csv'):
            a,b = row['node_id_start'],row['node_id_end']
            if a in seeds or b in seeds:
                if a not in nodes or b not in nodes:
                    raise ValueError(f'Dangling relationship: {a} / {b}')
                selected.update([a,b])
                edges.append({'id':f"r{len(edges)}",'from':a,'to':b,'kind':'relationship',
                    'relation':row['rel_type'],'label':row['link'],'source':row['sourceID'],
                    'start_date':row['start_date'],'end_date':row['end_date'],
                    'evidence_url':nodes[a]['url']})
        generation = next((n for n in archive.namelist() if n.startswith('GENERATED_ON_')),None)
    with source.open('rb') as source_stream:
        checksum = hashlib.file_digest(source_stream, 'sha256').hexdigest()
    result = {'meta':{'provider':'International Consortium of Investigative Journalists (ICIJ)',
        'source_url':'https://offshoreleaks.icij.org/pages/database',
        'download_url':'https://offshoreleaks-data.icij.org/offshoreleaks/csv/full-oldb.LATEST.zip',
        'retrieved':'2026-10-10','generation':generation,'sha256':checksum,
        'scope':f'{country}: all country-coded seeds and direct relationships', 'seed_count':len(seeds),
        'crs':'EPSG:4326','licenses':['ODbL-1.0','CC-BY-SA'],
        'location_note':'Capital coordinates are representative jurisdiction/country positions, not addresses.',
        'total_source_nodes':len(nodes),'missing_locations':sum(nodes[k]['lat'] is None for k in selected)},
        'nodes':[nodes[k] for k in sorted(selected)],'edges':edges}
    output.mkdir(parents=True,exist_ok=True)
    payload = json.dumps(result,ensure_ascii=False,separators=(',',':'))
    (output/'icij.json').write_text(payload,encoding='utf-8')
    (output/'icij.js').write_text('window.ICIJ_DATA='+payload+';\n',encoding='utf-8')
    logging.info('source nodes=%s seeds=%s subset nodes=%s edges=%s unmapped=%s',len(nodes),len(seeds),len(selected),len(edges),result['meta']['missing_locations'])
    return result

def main() -> None:
    """Run the import without fetching any data implicitly."""
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('zip',type=Path); parser.add_argument('--country',default='VNM')
    parser.add_argument('--output',type=Path,default=Path('webgis/data'))
    args=parser.parse_args(); logging.basicConfig(level=logging.INFO)
    prepare(args.zip,args.output,args.country)

if __name__ == '__main__': main()
