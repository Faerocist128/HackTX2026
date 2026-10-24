package assignment;
import java.io.*;

public class DictionaryTest {
    public static final String DICT_PATH = "prog5/words.txt";

    public static void main(String[] args) {
        System.out.println(System.getProperty("user.dir"));
        GameDictionary d = new GameDictionary();
        try {
            d.loadDictionary(DICT_PATH);
        }
        catch (IOException e) {
            System.err.println("you dun messed up");
            System.exit(1);
        }

        System.out.println("a: " + d.contains("a"));
        System.out.println("a: " + d.isPrefix("a"));
        System.out.println("\"\" is prefix?: " + d.isPrefix(""));
        System.out.println("\"\" in dictionary?: " + d.contains(""));
        // System.out.println(d.iterator().prev() == d.iterator().prev());
        System.out.println("empty string has prev?: " + d.iterator().hasPrev());
        System.out.println("aardvark: " + d.contains("aardvark"));
        GameDictionary.DictionaryIterator itr = d.iterator();
        itr.next('a');
        System.out.println("a contains ardvark?: " + itr.dict().contains("ardvark"));
        itr.prev();
        System.out.println("dict has aa?: " + d.contains("aa"));
        System.out.println("dict has aa (using iterator)?: " + itr.dict().contains("aa"));
        System.out.println(itr.hasNext('a'));
        itr.next('a');
        System.out.println(itr.hasNext('a'));
        itr.next('a');
        System.out.println(itr.hasNext('b'));
        itr.prev(); itr.prev();
        System.out.println(itr.dict().isPrefix("aab"));
    }

}
