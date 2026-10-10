"""Verify country selection, edge preservation, and unknown location handling."""
import csv
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from scripts.prepare_icij import prepare

class PrepareTest(unittest.TestCase):
    def test_one_hop_accounting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); source=root/'source.zip'
            with zipfile.ZipFile(source,'w') as archive:
                for kind in ['entities','officers','intermediaries','addresses','others']:
                    stream=io.StringIO(); writer=csv.DictWriter(stream,fieldnames=['node_id','name','country_codes','countries','jurisdiction_description','sourceID']); writer.writeheader()
                    if kind=='entities':
                        writer.writerows([{'node_id':'1','name':'seed','country_codes':'VNM','countries':'Viet Nam','sourceID':'test'}, {'node_id':'2','name':'related','country_codes':'XXX','countries':'Unknown'}, {'node_id':'3','name':'two hops','country_codes':'XXX','countries':'Unknown'}])
                    archive.writestr(f'nodes-{kind}.csv',stream.getvalue())
                archive.writestr('relationships.csv','node_id_start,node_id_end,rel_type,link,sourceID,start_date,end_date\n1,2,officer_of,officer,test,,\n2,3,officer_of,officer,test,,\n')
            result=prepare(source,root/'out','VNM')
            self.assertEqual(len(result['nodes']),2); self.assertEqual(len(result['edges']),1)
            self.assertEqual(result['meta']['missing_locations'],1)
            self.assertEqual(result['nodes'][0]['location_basis'],'Representative capital: Viet Nam')
            first=(root/'out/icij.json').read_text(encoding='utf-8')
            prepare(source,root/'out','VNM')
            self.assertEqual(first,(root/'out/icij.json').read_text(encoding='utf-8'))
            self.assertEqual(json.loads(first)['edges'][0]['kind'],'relationship')

if __name__ == '__main__': unittest.main()
