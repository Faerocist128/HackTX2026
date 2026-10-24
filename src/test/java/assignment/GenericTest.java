package assignment;
import java.io.*;
import java.util.*;

public class GenericTest {
    public static void main(String[] args) {
        ArrayList<Integer>arr = new ArrayList<>();
        arr.add(1); arr.add(2); arr.add(3);
        Iterator<Integer> i = arr.iterator();
        System.out.println(i.next());
        System.out.println(i.next());
        System.out.println(i.next());

        /*
        File f = new File("words.txt");
        Scanner s = null;
        GameDictionary d = new GameDictionary();
        try {
            s = new Scanner(f);
        }
        catch (FileNotFoundException e) {
            System.exit(-1);
        }
        int maxLength = 0;
        while (s.hasNextLine()) {
            String line = s.nextLine();
            int length = line.length();
            for (int i = 0; i < length; i ++) {
                if ((line.charAt(i) - 'a') < 0 || (line.charAt(i) - 'z') > 0) {
                    System.out.println(line.charAt(i));
                }
            }
            maxLength = Math.max(maxLength, length);
        }
        System.out.println(maxLength);
        s.close();
         */
    }
    public class TestIterator implements Iterator {
        public boolean hasNext() {
            return false;
        }
        public Object next() {
            return null;
        }
    }
}
